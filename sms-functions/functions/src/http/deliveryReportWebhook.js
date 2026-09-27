// POST /atDeliveryReportWebhook
// Africa's Talking calls this whenever an SMS status changes on the carrier network.
// Body: { id, status, phoneNumber, failureReason }
//   id            → AT's providerMessageId
//   status        → "Success" | "Failed" | "Rejected" etc.
//   phoneNumber   → recipient
//   failureReason → optional string
//
// We match `id` against `messages.providerMessageId` and update the doc.

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const db = getFirestore();

exports.atDeliveryReportWebhook = onRequest(
  { cors: false, invoker: 'public' },
  async (req, res) => {
    try {
      const { id, status, phoneNumber, failureReason } = req.body;

      if (!id) {
        return res.status(400).send('Missing message ID');
      }

      const q = await db.collection('messages')
        .where('providerMessageId', '==', id)
        .limit(1)
        .get();

      if (!q.empty) {
        const delivered = status === 'Success';

        await q.docs[0].ref.update({
          status: delivered ? 'DELIVERED' : 'REJECTED',
          'deliveryReport.status': status || null,
          'deliveryReport.phoneNumber': phoneNumber || null,
          'deliveryReport.failureReason': failureReason || null,
          'deliveryReport.updatedAt': FieldValue.serverTimestamp(),
          deliveredAt: delivered ? FieldValue.serverTimestamp() : null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`📬 DLR [${id}] → ${status} (${phoneNumber || 'unknown'})`);
      } else {
        console.warn(`⚠️ DLR for unknown messageId: ${id}`);
      }

      return res.status(200).send('DLR processed');
    } catch (err) {
      console.error('deliveryReportWebhook:', err);
      return res.status(500).send('Internal error');
    }
  }
);