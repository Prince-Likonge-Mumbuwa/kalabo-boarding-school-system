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
exports.getSmsHistory = require('./src/getSmsHistory').getSmsHistory;
exports.retrySms     = require('./src/retrySms').retrySms;

// ── Attendance ────────────────────────────────────────────────────────
// src/attendance/triggers.js is not in this folder. Loading it is guarded so
// the other functions (SMS, face recognition) can still be deployed. Until the
// file is restored, deploy ONLY named functions, e.g.
//   firebase deploy --only functions:faceMatch,functions:faceEnrol,...
// A plain `firebase deploy --only functions` would offer to DELETE the live
// onSessionWritten / rebuildStudentIndex — answer No.
try {
  const attendance = require('./src/attendance/triggers');
  exports.onSessionWritten    = attendance.onSessionWritten;
  exports.rebuildStudentIndex = attendance.rebuildStudentIndex;
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') throw e;
  console.warn('src/attendance/triggers.js is missing — attendance triggers not loaded.');
}

// ── Face recognition (see FACE_RECOGNITION.md in the app folder) ──────
const face = require('./src/face/functions');
exports.faceSetConsent    = face.faceSetConsent;
exports.faceEnrol         = face.faceEnrol;
exports.faceRevoke        = face.faceRevoke;
exports.faceMatch         = face.faceMatch;
exports.faceAdmin         = face.faceAdmin;
exports.faceSyncScheduled = require('./src/face/sync').faceSyncScheduled;