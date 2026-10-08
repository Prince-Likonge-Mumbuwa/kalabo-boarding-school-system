// Firebase Cloud Functions entry point — SMS engine

const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// All functions deploy to us-central1
setGlobalOptions({ region: 'us-central1' });

if (!admin.apps.length) admin.initializeApp();

// HTTP endpoints (called by frontend)
exports.sendSingleSms = require('./src/http/sendSingleSms').sendSingleSms;
exports.bulkSendSms   = require('./src/http/bulkSendSms').bulkSendSms;

// Webhook (called by Africa's Talking)
exports.atDeliveryReportWebhook = require('./src/http/deliveryReportWebhook').atDeliveryReportWebhook;

// Scheduled retry worker
exports.retryFailedSMSWorker = require('./src/scheduled/retryWorker').retryFailedSMSWorker;
exports.sendAnnouncement = require('./src/http/sendAnnouncement').sendAnnouncement;
exports.getSmsHistory = require('./getSmsHistory').getSmsHistory;
exports.retrySms     = require('./retrySms').retrySms;

// ── Attendance ────────────────────────────────────────────────────────
exports.onSessionWritten    = require('./src/attendance/triggers').onSessionWritten;
exports.rebuildStudentIndex = require('./src/attendance/triggers').rebuildStudentIndex;