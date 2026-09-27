// POST /sendSingleSms
// Body: { studentId, term, year }
// Writes PENDING doc → dispatches to AT synchronously → returns actual status.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { resolveStudent } = require('../lib/studentResolver');
const { validateZambianNumber } = require('../lib/phone');
const { formatSMSMessage } = require('../lib/messageFormatter');
const { dispatchMessage } = require('../lib/dispatch');

const AT_API_KEY   = defineSecret('AT_API_KEY');
const AT_USERNAME  = defineSecret('AT_USERNAME');
const AT_SENDER_ID = defineSecret('AT_SENDER_ID');

const db = getFirestore();

exports.sendSingleSms = onRequest(
  {
    cors: true,
    invoker: 'public',
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID],
  },
  async (req, res) => {
    try {
      const { studentId, term, year } = req.body;
      if (!studentId || !term || !year) {
        return res.status(400).json({ success: false, error: 'Missing studentId, term, or year' });
      }

      const student = await resolveStudent(studentId);
      if (!student) {
        return res.status(404).json({ success: false, error: `Student not found: ${studentId}` });
      }

      const sd = student.data;
      const studentName = sd.fullName || sd.name || 'Unknown';

      const rawPhone = sd.guardianPhone || sd.parentPhone || sd.phone || sd.contactNumber;
      if (!rawPhone) {
        return res.status(400).json({ success: false, error: 'No guardian phone number on file', studentName });
      }

      const validated = validateZambianNumber(rawPhone);
      if (!validated) {
        return res.status(400).json({ success: false, error: `Invalid phone number: ${rawPhone}`, studentName });
      }

      let classData = null;
      if (sd.classId) {
        const classDoc = await db.collection('classes').doc(sd.classId).get();
        if (classDoc.exists) classData = classDoc.data();
      }

      const hasResults = await db.collection('results')
        .where('studentId', '==', student.documentId)
        .where('term', '==', term)
        .where('year', '==', year)
        .limit(1).get();

      if (hasResults.empty) {
        return res.status(400).json({ success: false, error: 'No results available for this term/year', studentName });
      }

      const message = await formatSMSMessage(
        student.documentId, student.customId, term, year, sd, classData
      );

      // Write the message doc
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

        studentId: student.customId,
        studentDocumentId: student.documentId,
        studentName,
        guardianPhone: validated.number,
        carrier: validated.carrier,
        term, year,
        type: 'single',
        campaignId: null,

        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        sentAt: null,
        deliveredAt: null,
        deliveryReport: { status: null, phoneNumber: null, failureReason: null, updatedAt: null },
      });

      // Dispatch to Africa's Talking
      const result = await dispatchMessage(ref.id, { AT_API_KEY, AT_USERNAME, AT_SENDER_ID });

      if (result.sent) {
        return res.json({
          success: true,
          message: 'SMS sent successfully',
          preview: message,
          phoneNumber: validated.number,
          carrier: validated.carrier,
          status: 'sent',
          messageId: ref.id,
        });
      }

      return res.status(500).json({
        success: false,
        error: result.error || 'Africa\'s Talking rejected the message',
        studentName,
        messageId: ref.id,
      });
    } catch (err) {
      console.error('sendSingleSms:', err);
      return res.status(500).json({ success: false, error: err.message || 'Failed to send SMS' });
    }
  }
);