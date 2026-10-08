// POST /bulkSendSms
// Body: { classId, term, year }
// Loads active learners → writes PENDING docs → dispatches each inline.
//
// Success and failure entries both carry:
//   • messageId          — Firestore `messages` doc ID (absent on pre-flight skips)
//   • studentDocumentId  — Firestore `learners` doc ID (always present)
// so the UI can retry individual sends and, for phone-number failures,
// offer inline editing of the guardian phone.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validateZambianNumber } = require('../lib/phone');
const { formatSMSMessage } = require('../lib/messageFormatter');
const { dispatchMessage } = require('../lib/dispatch');

const AT_API_KEY   = defineSecret('AT_API_KEY');
const AT_USERNAME  = defineSecret('AT_USERNAME');
const AT_SENDER_ID = defineSecret('AT_SENDER_ID');

const db = getFirestore();

exports.bulkSendSms = onRequest(
  {
    cors: true,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID],
  },
  async (req, res) => {
    try {
      const { classId, term, year } = req.body;
      if (!classId || !term || !year) {
        return res.status(400).json({ success: false, error: 'Missing classId, term, or year' });
      }

      const classDoc = await db.collection('classes').doc(classId).get();
      if (!classDoc.exists) {
        return res.status(404).json({ success: false, error: 'Class not found' });
      }
      const classData = classDoc.data();

      const studentsSnap = await db.collection('learners')
        .where('classId', '==', classId)
        .where('status', '==', 'active')
        .get();

      if (studentsSnap.empty) {
        return res.status(404).json({ success: false, error: 'No active students in this class' });
      }

      const campaignRef = await db.collection('campaigns').add({
        title: `Bulk SMS — ${classData.name} — ${term} ${year}`,
        classId,
        className: classData.name,
        term, year,
        status: 'PROCESSING',
        totalRecipients: studentsSnap.size,
        queuedCount: 0,
        failedCount: 0,
        skippedNoPhone: 0,
        skippedNoResults: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const results    = [];
      const failedList = [];
      let sent = 0, skippedPhone = 0, skippedResults = 0;

      for (const docSnap of studentsSnap.docs) {
        const sd = docSnap.data();
        const docId = docSnap.id;
        const customId = sd.studentId || docId;
        const name = sd.fullName || sd.name || 'Unknown';

        const rawPhone = sd.guardianPhone || sd.parentPhone || sd.phone || sd.contactNumber;
        if (!rawPhone) {
          failedList.push({
            studentId: customId,
            studentName: name,
            reason: 'No phone number',
            studentDocumentId: docId,
          });
          skippedPhone++;
          continue;
        }

        const validated = validateZambianNumber(rawPhone);
        if (!validated) {
          failedList.push({
            studentId: customId,
            studentName: name,
            reason: 'Invalid phone number',
            studentDocumentId: docId,
          });
          continue;
        }

        const hasResults = await db.collection('results')
          .where('studentId', '==', docId)
          .where('term', '==', term)
          .where('year', '==', year)
          .limit(1).get();

        if (hasResults.empty) {
          failedList.push({
            studentId: customId,
            studentName: name,
            reason: 'No results available',
            studentDocumentId: docId,
          });
          skippedResults++;
          continue;
        }

        try {
          const message = await formatSMSMessage(docId, customId, term, year, sd, classData);

          const ref = await db.collection('messages').add({
            to: validated.number,
            message,
            from: null,
            status: 'PENDING',
            attempts: 0,
            providerMessageId: null,
            cost: null,
            statusCode: null,
            error: null,

            studentId: customId,
            studentDocumentId: docId,
            studentName: name,
            guardianPhone: validated.number,
            carrier: validated.carrier,
            term, year,
            classId,
            type: 'bulk',
            campaignId: campaignRef.id,

            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            sentAt: null,
            deliveredAt: null,
            deliveryReport: { status: null, phoneNumber: null, failureReason: null, updatedAt: null },
          });

          const result = await dispatchMessage(ref.id, { AT_API_KEY, AT_USERNAME, AT_SENDER_ID });

          if (result.sent) {
            sent++;
            results.push({
              studentId: customId,
              studentName: name,
              phoneNumber: validated.number,
              carrier: validated.carrier,
              status: 'sent',
              messageId: ref.id,
              studentDocumentId: docId,
            });
          } else {
            failedList.push({
              studentId: customId,
              studentName: name,
              reason: result.error || 'Send failed',
              messageId: ref.id,
              studentDocumentId: docId,
            });
          }
        } catch (err) {
          console.error(`Format error ${customId}:`, err);
          failedList.push({
            studentId: customId,
            studentName: name,
            reason: err.message,
            studentDocumentId: docId,
          });
        }
      }

      await campaignRef.update({
        status: 'DISPATCHED',
        queuedCount: sent,
        failedCount: failedList.length,
        skippedNoPhone: skippedPhone,
        skippedNoResults: skippedResults,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return res.json({
        success: true,
        total: studentsSnap.size,
        sent,
        failed: failedList.length,
        results,
        failedList,
        campaignId: campaignRef.id,
        summary: { skippedNoPhone: skippedPhone, skippedNoResults: skippedResults },
      });
    } catch (err) {
      console.error('bulkSendSms:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);