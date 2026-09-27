// Runs every 15 minutes. Finds FAILED messages with attempts < 3 and retries them.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { dispatchMessage } = require('../lib/dispatch');

const AT_API_KEY   = defineSecret('AT_API_KEY');
const AT_USERNAME  = defineSecret('AT_USERNAME');
const AT_SENDER_ID = defineSecret('AT_SENDER_ID');

const db = getFirestore();

exports.retryFailedSMSWorker = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeoutSeconds: 540,
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID],
  },
  async () => {
    const failed = await db.collection('messages')
      .where('status', '==', 'FAILED')
      .where('attempts', '<', 3)
      .limit(50)
      .get();

    if (failed.empty) {
      console.log('Retry worker: nothing to retry');
      return;
    }

    let retried = 0, succeeded = 0;

    for (const doc of failed.docs) {
      // Reset status so dispatchMessage will process it
      await doc.ref.update({
        status: 'PENDING',
        updatedAt: FieldValue.serverTimestamp(),
      });

      const result = await dispatchMessage(doc.id, { AT_API_KEY, AT_USERNAME, AT_SENDER_ID });
      retried++;
      if (result.sent) succeeded++;
    }

    console.log(`🔄 Retry worker: attempted ${retried}, succeeded ${succeeded}`);
  }
);