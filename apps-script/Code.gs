/**
 * Capital Markets Academy - Mentorship form handler
 *
 * Deploy: Extensions > Apps Script > paste this file > Deploy > New deployment > Web app
 *   Execute as: Me | Who has access: Anyone
 *
 * Set TURNSTILE_SECRET in Google Apps Script (not in git).
 */
const CONFIG = {
  TURNSTILE_SECRET: 'PASTE_YOUR_TURNSTILE_SECRET_KEY_HERE',
  NOTIFY_EMAIL: 'aiacademyforbeginners@gmail.com',
  MIN_FORM_SECONDS: 4,
  MAX_SUBMISSIONS_PER_HOUR: 5
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (isHoneypotFilled(data)) {
      return jsonResponse(false, 'Invalid submission');
    }

    if (!hasMinimumFormTime(data)) {
      return jsonResponse(false, 'Invalid submission');
    }

    if (!verifyTurnstile(data.turnstileToken)) {
      return jsonResponse(false, 'Verification failed. Please refresh and try again.');
    }

    if (isRateLimited(data.email)) {
      return jsonResponse(false, 'Too many submissions. Please try again later.');
    }

    const fields = normalizeFields(data);
    if (!fields) {
      return jsonResponse(false, 'Please complete all fields with valid information.');
    }

    recordSubmission(fields);
    sendNotificationEmail(fields);

    return jsonResponse(true);
  } catch (err) {
    return jsonResponse(false, 'Server error');
  }
}

function isHoneypotFilled(data) {
  return Boolean(String(data.website || '').trim());
}

function hasMinimumFormTime(data) {
  const startedAt = Number(data.formStartedAt);
  if (!startedAt || Number.isNaN(startedAt)) return false;
  return Date.now() - startedAt >= CONFIG.MIN_FORM_SECONDS * 1000;
}

function verifyTurnstile(token) {
  if (!token) return false;
  if (!CONFIG.TURNSTILE_SECRET || CONFIG.TURNSTILE_SECRET.indexOf('PASTE_') === 0) {
    throw new Error('Set CONFIG.TURNSTILE_SECRET in Apps Script before deploying.');
  }

  const response = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post',
    payload: {
      secret: CONFIG.TURNSTILE_SECRET,
      response: token
    },
    muteHttpExceptions: true
  });

  const result = JSON.parse(response.getContentText());
  return result.success === true;
}

function normalizeFields(data) {
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const phone = String(data.phone || '').trim();
  const why = String(data.why || '').trim();

  if (!isValidName(name)) return null;
  if (!isValidEmail(email)) return null;
  if (!isValidPhone(phone)) return null;
  if (!isValidWhy(why)) return null;

  return { name: name, email: email, phone: phone, why: why };
}

function isValidName(name) {
  if (name.length < 2 || name.length > 80) return false;
  if (!/^[a-zA-Z\u00C0-\u024F\s'.-]+$/.test(name)) return false;
  if (looksLikeGibberish(name)) return false;
  return true;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function isValidWhy(why) {
  if (why.length < 30 || why.length > 2000) return false;

  const words = why.split(/\s+/).filter(function(word) {
    return word.length > 0;
  });
  if (words.length < 3) return false;
  if (looksLikeGibberish(why)) return false;

  return true;
}

function looksLikeGibberish(text) {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 12) return false;

  const words = text.trim().split(/\s+/);
  if (words.length >= 3) return false;

  const vowels = (compact.match(/[aeiouAEIOU]/g) || []).length;
  const vowelRatio = vowels / compact.length;
  if (vowelRatio < 0.15) return true;

  const upperTransitions = (compact.match(/[a-z][A-Z]|[A-Z][a-z]/g) || []).length;
  if (upperTransitions >= 4 && words.length === 1) return true;

  if (/^[A-Za-z0-9._-]+$/.test(compact) && !compact.includes('@') && words.length === 1 && compact.length >= 14) {
    return true;
  }

  return false;
}

function isRateLimited(email) {
  const key = 'rate_' + Utilities.base64EncodeWebSafe(email).slice(0, 40);
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(key);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const recent = raw ? JSON.parse(raw).filter(function(ts) { return now - ts < windowMs; }) : [];

  if (recent.length >= CONFIG.MAX_SUBMISSIONS_PER_HOUR) return true;

  recent.push(now);
  props.setProperty(key, JSON.stringify(recent));
  return false;
}

function recordSubmission(fields) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([
    new Date(),
    fields.name,
    fields.email,
    fields.phone,
    fields.why
  ]);
}

function sendNotificationEmail(fields) {
  const subject = 'New Inner Circle Mentorship Application - ' + fields.name;
  const body =
    'Name: ' + fields.name + '\n' +
    'Email: ' + fields.email + '\n' +
    'Phone: ' + fields.phone + '\n\n' +
    'Why they want to join:\n' + fields.why;

  GmailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body, {
    replyTo: fields.email
  });
}

function jsonResponse(success, error) {
  const output = success ? { success: true } : { success: false, error: error || 'Submission failed' };
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}
