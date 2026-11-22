/**
 * Capital Markets Academy Game: anonymous results receiver (v2).
 * SEPARATE from the lead-capture script, bound to its own Google Sheet ("CMA Game Results").
 * Accepts one anonymous row per level attempt and rejects anything that does not look like a
 * genuine game record. Never receives names, emails or device details.
 *
 * Setup:
 * 1. Run setup() once (authorise when asked). It builds the Results, Summary and Scenario Key
 *    tabs, reading the scenarios from the live game. Re-run it if the scenarios change.
 * 2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 * 3. Put the Web app URL in EVENTS_ENDPOINT in the game's index.html.
 */
var COLS = ['ts','session','level','attempt','levelsThisSession','outcome','answered','scenarios',
            'points','discipline','hints','routes','secs','source'];
var OUTCOMES = ['passed','failed','catastrophic','abandoned'];

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!valid_(d)) return out_();
    var lock = LockService.getScriptLock(); lock.waitLock(5000);
    SpreadsheetApp.getActive().getSheetByName('Results')
      .appendRow(COLS.map(function (k) { return k === 'ts' ? new Date() : d[k]; }));
    lock.releaseLock();
  } catch (err) {}
  return out_();
}

function valid_(d) {
  var n = function (v, lo, hi) { return typeof v === 'number' && v >= lo && v <= hi; };
  return !!d && d.type === 'level_result' && d.v === 2 &&
    n(d.level, 1, 5) && n(d.attempt, 1, 500) && n(d.levelsThisSession, 1, 2000) &&
    OUTCOMES.indexOf(d.outcome) > -1 && n(d.answered, 1, 5) && n(d.scenarios, 5, 5) &&
    n(d.points, 0, 100) && n(d.discipline, 0, 100) && n(d.hints, 0, 5) && n(d.secs, 0, 86400) &&
    typeof d.session === 'string' && /^[a-z0-9]{4,12}$/.test(d.session) &&
    typeof d.routes === 'string' && /^( [1-5]\.[0-3][RPWF]h?)+ $/.test(d.routes) &&
    typeof d.source === 'string' && d.source.length <= 40;
}

function out_() { return ContentService.createTextOutput('ok'); }

/* Reads the scenarios straight from the live game, so the key stays in step with it. */
function loadKey_() {
  var html = UrlFetchApp.fetch('https://game.capitalmarketsacademy.com/').getContentText();
  var a = html.indexOf('const LEVELS = ') + 'const LEVELS = '.length;
  var b = html.indexOf('\n];', a) + 2;
  var LEVELS = (new Function('return ' + html.slice(a, b)))();
  var V = {right: 'Right', partial: 'Partly right', wrong: 'Wrong', fatal: 'Catastrophic'};
  var out = [];
  LEVELS.forEach(function (lv, li) { lv.scenarios.forEach(function (sc, si) { sc.o.forEach(function (o, oi) {
    out.push([li + 1, si + 1, oi, V[o.v], sc.t, o.t]);
  }); }); });
  return out;
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  var r = ss.getSheetByName('Results') || ss.insertSheet('Results');
  if (r.getLastRow() === 0) { r.appendRow(COLS); r.setFrozenRows(1); }

  var k = ss.getSheetByName('Scenario Key') || ss.insertSheet('Scenario Key');
  k.clear();
  var head = ['Level','Scenario','Option','Verdict','Scenario title','Option text','Times chosen','Share of answers'];
  var rows = loadKey_().map(function (x, i) {
    var row = i + 2;
    return x.concat([
      '=COUNTIFS(Results!$C:$C,A' + row + ',Results!$L:$L,"* "&B' + row + '&"."&C' + row + '&"*")',
      '=IFERROR(G' + row + '/SUMIFS($G:$G,$A:$A,A' + row + ',$B:$B,B' + row + '),0)'
    ]);
  });
  k.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  k.getRange(2, 1, rows.length, head.length).setValues(rows);
  k.getRange(2, 8, rows.length, 1).setNumberFormat('0%');
  k.setFrozenRows(1);

  var s = ss.getSheetByName('Summary') || ss.insertSheet('Summary', 0);
  s.clear();
  var sh = ['Level','Attempts','Players (sessions)','Passed','Pass rate (finished attempts)','Catastrophic',
            'Abandoned mid-level','Abandon rate','Avg Discipline (finished)','First-attempt pass rate',
            'Repeat-attempt pass rate','Avg guidance requests'];
  s.getRange(1, 1, 1, sh.length).setValues([sh]).setFontWeight('bold');
  var C = 'Results!$C:$C', F = 'Results!$F:$F', D = 'Results!$D:$D', f = [];
  for (var L = 1; L <= 5; L++) {
    var w = L + 1, lv = C + ',A' + w;
    f.push([L,
      '=COUNTIF(' + lv + ')',
      '=IFERROR(ROWS(UNIQUE(FILTER(Results!$B:$B,' + C + '=A' + w + ',Results!$B:$B<>""))),0)',
      '=COUNTIFS(' + lv + ',' + F + ',"passed")',
      '=IFERROR(D' + w + '/COUNTIFS(' + lv + ',' + F + ',"<>abandoned"),0)',
      '=COUNTIFS(' + lv + ',' + F + ',"catastrophic")',
      '=COUNTIFS(' + lv + ',' + F + ',"abandoned")',
      '=IFERROR(G' + w + '/B' + w + ',0)',
      '=IFERROR(AVERAGEIFS(Results!$J:$J,' + lv + ',' + F + ',"<>abandoned"),0)',
      '=IFERROR(COUNTIFS(' + lv + ',' + D + ',1,' + F + ',"passed")/COUNTIFS(' + lv + ',' + D + ',1,' + F + ',"<>abandoned"),0)',
      '=IFERROR(COUNTIFS(' + lv + ',' + D + ',">1",' + F + ',"passed")/COUNTIFS(' + lv + ',' + D + ',">1",' + F + ',"<>abandoned"),0)',
      '=IFERROR(AVERAGEIF(' + lv + ',Results!$K:$K),0)'
    ]);
  }
  s.getRange(2, 1, 5, sh.length).setValues(f);
  s.getRange(2, 5, 5, 1).setNumberFormat('0%');
  s.getRange(2, 8, 5, 1).setNumberFormat('0%');
  s.getRange(2, 9, 5, 1).setNumberFormat('0.0');
  s.getRange(2, 10, 5, 2).setNumberFormat('0%');
  s.getRange(2, 12, 5, 1).setNumberFormat('0.00');
  s.getRange(8, 1).setValue('Most-chosen traps: sort the Scenario Key tab by Times chosen, filtered to Verdict Wrong or Catastrophic.');
  s.getRange(9, 1).setValue('Treat figures as indicative until a level has at least 100 finished attempts. Repeat attempts reuse the same questions, so they show recall, not proof of learning.');
  s.setFrozenRows(1);
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);
}
