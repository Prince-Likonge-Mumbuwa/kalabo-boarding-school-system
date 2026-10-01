// POST /sendAnnouncement
// Body: {
//   message: string,
//   target: { type: 'all' } | { type: 'student', studentId: string },
//   senderName: string,
//   senderUid: string
// }
// Sends a free-form SMS to guardians of active learners.
// Bulk: all learners. Personal: one learner.
// Writes an `announcements` doc for audit, plus one `messages` doc per recipient.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validateZambianNumber } = require('../lib/phone');
const { dispatchMessage } = require('../lib/dispatch');

const AT_API_KEY   = defineSecret('AT_API_KEY');
const AT_USERNAME  = defineSecret('AT_USERNAME');
const AT_SENDER_ID = defineSecret('AT_SENDER_ID');

const db = getFirestore();
const MAX_RECIPIENTS = 500;
const MAX_MESSAGE_LENGTH = 480;

exports.sendAnnouncement = onRequest(
  {
    cors: true,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID],
  },
  async (req, res) => {
    try {
      const { message, target, senderName, senderUid } = req.body;

      // Validate message
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Message is required' });
      }
      const trimmedMessage = message.trim();
      if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters`,
        });
      }

      // Validate target
      if (!target || !target.type) {
        return res.status(400).json({ success: false, error: 'Target is required' });
      }

      // -------- Collect learners --------
      let learnersSnap;
      let targetDisplay = '';

      if (target.type === 'all') {
        learnersSnap = await db.collection('learners')
          .where('status', '==', 'active')
          .get();
        targetDisplay = 'All parents';
      } else if (target.type === 'student') {
        if (!target.studentId) {
          return res.status(400).json({ success: false, error: 'studentId required for target.type=student' });
        }
        // studentId might be a custom ID (G12A_001) or a Firestore doc ID
        const byCustom = await db.collection('learners')
          .where('studentId', '==', target.studentId)
          .limit(1).get();
        if (!byCustom.empty) {
          learnersSnap = byCustom;
        } else {
          const byDocId = await db.collection('learners').doc(target.studentId).get();
          if (byDocId.exists) {
            // Emulate QuerySnapshot shape
            learnersSnap = { docs: [byDocId], size: 1, empty: false };
          } else {
            return res.status(404).json({ success: false, error: 'Student not found' });
          }
        }
        const firstData = learnersSnap.docs[0].data();
        targetDisplay = `Personal — ${firstData.fullName || firstData.name || target.studentId}`;
      } else {
        return res.status(400).json({ success: false, error: 'Invalid target.type' });
      }

      if (!learnersSnap || learnersSnap.empty) {
        return res.status(404).json({ success: false, error: 'No active learners found for this target' });
      }

      if (learnersSnap.size > MAX_RECIPIENTS) {
        return res.status(400).json({
          success: false,
          error: `This target has ${learnersSnap.size} recipients. Split into batches of ${MAX_RECIPIENTS} or fewer.`,
        });
      }

      // -------- Create announcement doc --------
      const announcementRef = await db.collection('announcements').add({
        message: trimmedMessage,
        target: {
          type: target.type,
          studentId: target.studentId || null,
          displayName: targetDisplay,
        },
        senderName: senderName || 'Admin',
        senderUid: senderUid || null,
        totalRecipients: learnersSnap.size,
        sentCount: 0,
        failedCount: 0,
        status: 'PROCESSING',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // -------- Loop recipients --------
      const results = [];
      const failedList = [];
      let sent = 0, skippedNoPhone = 0, skippedInvalid = 0;

      for (const docSnap of learnersSnap.docs) {
        const sd = docSnap.data();
        const docId = docSnap.id;
        const customId = sd.studentId || docId;
        const name = sd.fullName || sd.name || 'Unknown';

        const rawPhone = sd.guardianPhone || sd.parentPhone || sd.phone || sd.contactNumber;
        if (!rawPhone) {
          failedList.push({ studentId: customId, studentName: name, reason: 'No phone number' });
          skippedNoPhone++;
          continue;
        }

        const validated = validateZambianNumber(rawPhone);
        if (!validated) {
          failedList.push({ studentId: customId, studentName: name, reason: 'Invalid phone number' });
          skippedInvalid++;
          continue;
        }

        try {
          const messageRef = await db.collection('messages').add({
            to: validated.number,
            message: trimmedMessage,
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
            type: 'announcement',
            announcementId: announcementRef.id,
            campaignId: null,
            term: null,
            year: null,

            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            sentAt: null,
            deliveredAt: null,
            deliveryReport: { status: null, phoneNumber: null, failureReason: null, updatedAt: null },
          });

          const result = await dispatchMessage(messageRef.id, { AT_API_KEY, AT_USERNAME, AT_SENDER_ID });

          if (result.sent) {
            sent++;
            results.push({
              studentId: customId,
              studentName: name,
              phoneNumber: validated.number,
              carrier: validated.carrier,
              status: 'sent',
            });
          } else {
            failedList.push({ studentId: customId, studentName: name, reason: result.error || 'Send failed' });
          }
        } catch (err) {
          console.error(`Announcement error ${customId}:`, err);
          failedList.push({ studentId: customId, studentName: name, reason: err.message });
        }
      }

      await announcementRef.update({
        status: 'COMPLETED',
        sentCount: sent,
        failedCount: failedList.length,
        skippedNoPhone,
        skippedInvalid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return res.json({
        success: true,
        announcementId: announcementRef.id,
        total: learnersSnap.size,
        sent,
        failed: failedList.length,
        results,
        failedList,
        summary: { skippedNoPhone, skippedInvalid },
      });
    } catch (err) {
      console.error('sendAnnouncement:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);