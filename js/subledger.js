/**
 * subledger.js
 * Browser-compatible in-memory subledger (journal entry store).
 * Simulates a SQL table with SQL-like query methods.
 *
 * Schema mirrors:
 *   CREATE TABLE journal_entries (
 *     je_id, je_date, period, policy_number, line_of_business,
 *     transaction_type, rule_id, rule_name, description,
 *     account_code, account_name, account_type,
 *     debit, credit, net_amount, ledger, source, status,
 *     created_at, posted_at, batch_id
 *   )
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Format a Date as 'YYYY-MM-DD' */
  function toDateStr(d) {
    if (!d) return null;
    var dt = d instanceof Date ? d : new Date(d);
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  /** Derive period string 'YYYY-MM' from a date value */
  function toPeriod(d) {
    if (!d) return null;
    var dt = d instanceof Date ? d : new Date(d);
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1);
  }

  /** ISO timestamp string */
  function toTimestamp(d) {
    if (!d) return null;
    var dt = d instanceof Date ? d : new Date(d);
    return dt.toISOString();
  }

  /** Round to 2 decimal places */
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  /** Format number as currency string */
  function fmtCurrency(n) {
    var v = round2(n);
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Escape HTML special characters */
  function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // createSubledger
  // ---------------------------------------------------------------------------

  function createSubledger() {

    var _entries = [];   // Array of row objects matching the schema
    var _nextSeq = 1;    // Auto-increment seed for batch IDs

    // -------------------------------------------------------------------------
    // postJournalEntries
    // -------------------------------------------------------------------------
    /**
     * Accept an array of JournalEntry objects produced by the rules engine.
     * Each JournalEntry is expected to have the shape:
     *   {
     *     je_id, je_date, policy_number, line_of_business,
     *     transaction_type, rule_id, rule_name, description,
     *     ledger, source, status,
     *     lines: [{ account_code, account_name, account_type, debit, credit, description? }]
     *   }
     *
     * Returns: { batchId, postedCount, errors }
     */
    function postJournalEntries(journalEntries) {
      var batchId = 'BATCH-' + String(_nextSeq++).padStart(6, '0');
      var now = new Date();
      var postedCount = 0;
      var errors = [];

      if (!Array.isArray(journalEntries) || journalEntries.length === 0) {
        return { batchId: batchId, postedCount: 0, errors: ['No journal entries provided'] };
      }

      journalEntries.forEach(function (je, jeIdx) {
        try {
          if (!je.je_id) throw new Error('Missing je_id on entry index ' + jeIdx);
          if (!je.je_date) throw new Error('Missing je_date on entry ' + je.je_id);
          if (!Array.isArray(je.lines) || je.lines.length === 0) {
            throw new Error('No lines on entry ' + je.je_id);
          }

          var jeDate = je.je_date instanceof Date ? je.je_date : new Date(je.je_date);
          var period = je.period || toPeriod(jeDate);
          var createdAt = toTimestamp(now);
          var postedAt = (je.status === 'posted' || !je.status) ? toTimestamp(now) : null;
          var status = je.status || 'posted';

          je.lines.forEach(function (line, lineIdx) {
            var debit = round2(line.debit || 0);
            var credit = round2(line.credit || 0);
            var row = {
              je_id:             je.je_id,
              je_date:           toDateStr(jeDate),
              period:            period,
              policy_number:     je.policy_number  || null,
              line_of_business:  je.line_of_business || null,
              transaction_type:  je.transaction_type || null,
              rule_id:           je.rule_id          || null,
              rule_name:         je.rule_name        || null,
              description:       line.description || je.description || null,
              account_code:      line.account_code   || null,
              account_name:      line.account_name   || null,
              account_type:      line.account_type   || null,
              debit:             debit,
              credit:            credit,
              net_amount:        round2(debit - credit),
              ledger:            je.ledger           || 'SUBLEDGER',
              source:            je.source           || 'GWPC',
              status:            status,
              created_at:        createdAt,
              posted_at:         postedAt,
              batch_id:          batchId,
              _line_index:       lineIdx   // internal — helps getJournalEntryDetail ordering
            };
            _entries.push(row);
            postedCount++;
          });

        } catch (err) {
          errors.push({ jeId: (je && je.je_id) || ('index-' + jeIdx), error: err.message });
        }
      });

      return { batchId: batchId, postedCount: postedCount, errors: errors };
    }

    // -------------------------------------------------------------------------
    // query
    // -------------------------------------------------------------------------
    /**
     * filters: {
     *   period?, lineOfBusiness?, accountCode?, status?,
     *   transactionType?, ruleId?, search?
     * }
     * Returns rows sorted by je_date DESC, je_id ASC.
     */
    function query(filters) {
      filters = filters || {};
      var results = _entries.filter(function (row) {
        if (filters.period && row.period !== filters.period) return false;
        if (filters.lineOfBusiness && row.line_of_business !== filters.lineOfBusiness) return false;
        if (filters.accountCode && row.account_code !== filters.accountCode) return false;
        if (filters.status && row.status !== filters.status) return false;
        if (filters.transactionType && row.transaction_type !== filters.transactionType) return false;
        if (filters.ruleId && row.rule_id !== filters.ruleId) return false;
        if (filters.batchId && row.batch_id !== filters.batchId) return false;
        if (filters.search) {
          var needle = filters.search.toLowerCase();
          var haystack = [
            row.je_id, row.policy_number, row.description,
            row.account_code, row.account_name, row.rule_name,
            row.line_of_business, row.transaction_type
          ].join(' ').toLowerCase();
          if (haystack.indexOf(needle) === -1) return false;
        }
        return true;
      });

      results.sort(function (a, b) {
        // je_date DESC
        if (a.je_date < b.je_date) return 1;
        if (a.je_date > b.je_date) return -1;
        // je_id ASC
        if (a.je_id < b.je_id) return -1;
        if (a.je_id > b.je_id) return 1;
        return (a._line_index || 0) - (b._line_index || 0);
      });

      return results;
    }

    // -------------------------------------------------------------------------
    // getTrialBalance
    // -------------------------------------------------------------------------
    /**
     * Group posted rows by account_code, summing debits and credits.
     * Returns Array<{ accountCode, accountName, accountType, totalDebit, totalCredit, netBalance }>
     * sorted by accountCode ASC.
     */
    function getTrialBalance(period) {
      var rows = query(period ? { period: period, status: 'posted' } : { status: 'posted' });
      var map = {};

      rows.forEach(function (row) {
        if (!row.account_code) return;
        var key = row.account_code;
        if (!map[key]) {
          map[key] = {
            accountCode: row.account_code,
            accountName: row.account_name || '',
            accountType: row.account_type || '',
            totalDebit:  0,
            totalCredit: 0,
            netBalance:  0
          };
        }
        map[key].totalDebit  = round2(map[key].totalDebit  + row.debit);
        map[key].totalCredit = round2(map[key].totalCredit + row.credit);
      });

      var result = Object.values(map).map(function (acct) {
        acct.netBalance = round2(acct.totalDebit - acct.totalCredit);
        return acct;
      });

      result.sort(function (a, b) {
        if (a.accountCode < b.accountCode) return -1;
        if (a.accountCode > b.accountCode) return 1;
        return 0;
      });

      return result;
    }

    // -------------------------------------------------------------------------
    // getPeriodSummary
    // -------------------------------------------------------------------------
    /**
     * Returns { period, totalDebits, totalCredits, entriesCount, policiesCount, balanced }
     */
    function getPeriodSummary(period) {
      var rows = query({ period: period });
      var totalDebits = 0;
      var totalCredits = 0;
      var jeIds = {};
      var policies = {};

      rows.forEach(function (row) {
        totalDebits  = round2(totalDebits  + row.debit);
        totalCredits = round2(totalCredits + row.credit);
        jeIds[row.je_id] = true;
        if (row.policy_number) policies[row.policy_number] = true;
      });

      return {
        period:        period,
        totalDebits:   totalDebits,
        totalCredits:  totalCredits,
        entriesCount:  Object.keys(jeIds).length,
        policiesCount: Object.keys(policies).length,
        balanced:      Math.abs(totalDebits - totalCredits) < 0.005
      };
    }

    // -------------------------------------------------------------------------
    // getJournalEntryDetail
    // -------------------------------------------------------------------------
    /** Return all rows belonging to a given je_id, ordered by line index. */
    function getJournalEntryDetail(jeId) {
      return _entries
        .filter(function (r) { return r.je_id === jeId; })
        .sort(function (a, b) { return (a._line_index || 0) - (b._line_index || 0); });
    }

    // -------------------------------------------------------------------------
    // getStats
    // -------------------------------------------------------------------------
    /**
     * Returns {
     *   totalEntries, totalPosted, totalPending, totalDebits, totalCredits,
     *   periodBreakdown: [{period, count, debits, credits}],
     *   lobBreakdown:    [{lob, count, totalDebits}]
     * }
     */
    function getStats() {
      var totalEntries = _entries.length;
      var totalPosted  = 0;
      var totalPending = 0;
      var totalDebits  = 0;
      var totalCredits = 0;
      var periodMap = {};
      var lobMap    = {};

      _entries.forEach(function (row) {
        if (row.status === 'posted')  totalPosted++;
        if (row.status === 'pending') totalPending++;
        totalDebits  = round2(totalDebits  + row.debit);
        totalCredits = round2(totalCredits + row.credit);

        // Period breakdown
        var p = row.period || 'unknown';
        if (!periodMap[p]) periodMap[p] = { period: p, count: 0, debits: 0, credits: 0 };
        periodMap[p].count++;
        periodMap[p].debits  = round2(periodMap[p].debits  + row.debit);
        periodMap[p].credits = round2(periodMap[p].credits + row.credit);

        // LOB breakdown
        var lob = row.line_of_business || 'Unknown';
        if (!lobMap[lob]) lobMap[lob] = { lob: lob, count: 0, totalDebits: 0 };
        lobMap[lob].count++;
        lobMap[lob].totalDebits = round2(lobMap[lob].totalDebits + row.debit);
      });

      var periodBreakdown = Object.values(periodMap).sort(function (a, b) {
        if (a.period < b.period) return 1;
        if (a.period > b.period) return -1;
        return 0;
      });

      var lobBreakdown = Object.values(lobMap).sort(function (a, b) {
        return b.totalDebits - a.totalDebits;
      });

      return {
        totalEntries:    totalEntries,
        totalPosted:     totalPosted,
        totalPending:    totalPending,
        totalDebits:     totalDebits,
        totalCredits:    totalCredits,
        periodBreakdown: periodBreakdown,
        lobBreakdown:    lobBreakdown
      };
    }

    // -------------------------------------------------------------------------
    // clear
    // -------------------------------------------------------------------------
    function clear() {
      _entries = [];
    }

    // -------------------------------------------------------------------------
    // toSQL
    // -------------------------------------------------------------------------
    /**
     * Generate a SQL CREATE TABLE + INSERT statements string for demo display.
     */
    function toSQL() {
      var lines = [];

      lines.push('-- AccountingHub Subledger Export');
      lines.push('-- Generated: ' + new Date().toISOString());
      lines.push('-- Total rows: ' + _entries.length);
      lines.push('');
      lines.push('CREATE TABLE IF NOT EXISTS journal_entries (');
      lines.push('  je_id             VARCHAR(20)     PRIMARY KEY,');
      lines.push('  je_date           DATE            NOT NULL,');
      lines.push('  period            VARCHAR(7),');
      lines.push('  policy_number     VARCHAR(20),');
      lines.push('  line_of_business  VARCHAR(30),');
      lines.push('  transaction_type  VARCHAR(30),');
      lines.push('  rule_id           VARCHAR(20),');
      lines.push('  rule_name         VARCHAR(100),');
      lines.push('  description       TEXT,');
      lines.push('  account_code      VARCHAR(10),');
      lines.push('  account_name      VARCHAR(100),');
      lines.push('  account_type      VARCHAR(20),');
      lines.push('  debit             DECIMAL(15,2),');
      lines.push('  credit            DECIMAL(15,2),');
      lines.push('  net_amount        DECIMAL(15,2),');
      lines.push('  ledger            VARCHAR(20),');
      lines.push('  source            VARCHAR(20),');
      lines.push('  status            VARCHAR(20),');
      lines.push('  created_at        TIMESTAMP,');
      lines.push('  posted_at         TIMESTAMP,');
      lines.push('  batch_id          VARCHAR(20)');
      lines.push(');');
      lines.push('');

      function sqlStr(v) {
        if (v === null || v === undefined) return 'NULL';
        return "'" + String(v).replace(/'/g, "''") + "'";
      }

      _entries.forEach(function (row) {
        lines.push(
          'INSERT INTO journal_entries ' +
          '(je_id, je_date, period, policy_number, line_of_business, transaction_type, ' +
          'rule_id, rule_name, description, account_code, account_name, account_type, ' +
          'debit, credit, net_amount, ledger, source, status, created_at, posted_at, batch_id) VALUES (' +
          [
            sqlStr(row.je_id),
            sqlStr(row.je_date),
            sqlStr(row.period),
            sqlStr(row.policy_number),
            sqlStr(row.line_of_business),
            sqlStr(row.transaction_type),
            sqlStr(row.rule_id),
            sqlStr(row.rule_name),
            sqlStr(row.description),
            sqlStr(row.account_code),
            sqlStr(row.account_name),
            sqlStr(row.account_type),
            row.debit,
            row.credit,
            row.net_amount,
            sqlStr(row.ledger),
            sqlStr(row.source),
            sqlStr(row.status),
            sqlStr(row.created_at),
            sqlStr(row.posted_at),
            sqlStr(row.batch_id)
          ].join(', ') +
          ');'
        );
      });

      return lines.join('\n');
    }

    // -------------------------------------------------------------------------
    // renderTableHTML
    // -------------------------------------------------------------------------
    /**
     * Generate an HTML <table> string for UI display.
     * options: { maxRows?, showPagination?, highlightUnbalanced? }
     */
    function renderTableHTML(rows, options) {
      options = options || {};
      var maxRows = options.maxRows || 200;
      var highlightUnbalanced = options.highlightUnbalanced !== false;

      var displayRows = rows.slice(0, maxRows);
      var truncated   = rows.length > maxRows;

      var COLS = [
        { key: 'je_id',            label: 'JE ID' },
        { key: 'je_date',          label: 'Date' },
        { key: 'period',           label: 'Period' },
        { key: 'policy_number',    label: 'Policy #' },
        { key: 'line_of_business', label: 'LOB' },
        { key: 'transaction_type', label: 'Txn Type' },
        { key: 'account_code',     label: 'Acct Code' },
        { key: 'account_name',     label: 'Account Name' },
        { key: 'account_type',     label: 'Acct Type' },
        { key: 'debit',            label: 'Debit',   numeric: true },
        { key: 'credit',           label: 'Credit',  numeric: true },
        { key: 'net_amount',       label: 'Net',     numeric: true },
        { key: 'status',           label: 'Status' },
        { key: 'batch_id',         label: 'Batch ID' }
      ];

      var html = [];
      html.push('<div class="subledger-table-wrapper">');

      if (truncated) {
        html.push(
          '<div class="subledger-notice" style="padding:6px 10px;background:#fff3cd;border:1px solid #ffc107;margin-bottom:6px;font-size:0.85em;">' +
          'Showing ' + maxRows + ' of ' + rows.length + ' rows.' +
          '</div>'
        );
      }

      html.push('<table class="subledger-table" style="width:100%;border-collapse:collapse;font-size:0.85em;font-family:monospace;" data-row-count="' + rows.length + '">');

      // --- THEAD ---
      html.push('<thead>');
      html.push('<tr style="background:#1a237e;color:#fff;">');
      COLS.forEach(function (col) {
        html.push(
          '<th data-col="' + escHtml(col.key) + '" style="padding:6px 8px;text-align:' +
          (col.numeric ? 'right' : 'left') + ';white-space:nowrap;border:1px solid #283593;">' +
          escHtml(col.label) + '</th>'
        );
      });
      html.push('</tr>');
      html.push('</thead>');

      // --- TBODY ---
      html.push('<tbody>');

      // Track per-je_id totals for unbalanced highlighting
      var jeTotals = {};
      if (highlightUnbalanced) {
        displayRows.forEach(function (row) {
          if (!jeTotals[row.je_id]) jeTotals[row.je_id] = { debit: 0, credit: 0 };
          jeTotals[row.je_id].debit  = round2(jeTotals[row.je_id].debit  + row.debit);
          jeTotals[row.je_id].credit = round2(jeTotals[row.je_id].credit + row.credit);
        });
      }

      displayRows.forEach(function (row, idx) {
        var isUnbalanced = highlightUnbalanced &&
          jeTotals[row.je_id] &&
          Math.abs(jeTotals[row.je_id].debit - jeTotals[row.je_id].credit) >= 0.005;

        var rowBg = isUnbalanced
          ? '#fff8e1'
          : (idx % 2 === 0 ? '#f8f9fa' : '#ffffff');

        var statusStyle = '';
        if (row.status === 'posted')  statusStyle = 'color:#1b5e20;font-weight:bold;';
        if (row.status === 'pending') statusStyle = 'color:#e65100;';
        if (row.status === 'error')   statusStyle = 'color:#b71c1c;font-weight:bold;';

        html.push(
          '<tr data-je-id="' + escHtml(row.je_id) + '" ' +
          'data-period="' + escHtml(row.period) + '" ' +
          'data-status="' + escHtml(row.status) + '" ' +
          'style="background:' + rowBg + ';">'
        );

        COLS.forEach(function (col) {
          var val = row[col.key];
          var cellStyle = 'padding:5px 8px;border:1px solid #e0e0e0;';

          if (col.numeric) {
            cellStyle += 'text-align:right;';
            if (col.key === 'debit'  && val > 0) cellStyle += 'background:#ffebee;color:#c62828;';
            if (col.key === 'credit' && val > 0) cellStyle += 'background:#e8f5e9;color:#2e7d32;';
            if (col.key === 'net_amount') {
              if (val > 0) cellStyle += 'color:#c62828;';
              else if (val < 0) cellStyle += 'color:#2e7d32;';
            }
          }

          if (col.key === 'status') cellStyle += statusStyle;

          var display = (val === null || val === undefined) ? '' :
            col.numeric ? fmtCurrency(val) : escHtml(String(val));

          html.push('<td style="' + cellStyle + '">' + display + '</td>');
        });

        html.push('</tr>');
      });

      html.push('</tbody>');

      // --- TFOOT (column totals) ---
      var sumDebit  = 0;
      var sumCredit = 0;
      var sumNet    = 0;
      displayRows.forEach(function (r) {
        sumDebit  = round2(sumDebit  + r.debit);
        sumCredit = round2(sumCredit + r.credit);
        sumNet    = round2(sumNet    + r.net_amount);
      });

      html.push('<tfoot>');
      html.push('<tr style="background:#e8eaf6;font-weight:bold;">');
      COLS.forEach(function (col) {
        var cellStyle = 'padding:6px 8px;border:1px solid #c5cae9;';
        var display = '';
        if (col.key === 'je_id') {
          display = 'TOTALS';
        } else if (col.key === 'debit') {
          cellStyle += 'text-align:right;background:#ffebee;color:#c62828;';
          display = fmtCurrency(sumDebit);
        } else if (col.key === 'credit') {
          cellStyle += 'text-align:right;background:#e8f5e9;color:#2e7d32;';
          display = fmtCurrency(sumCredit);
        } else if (col.key === 'net_amount') {
          cellStyle += 'text-align:right;';
          display = fmtCurrency(sumNet);
        } else if (col.numeric) {
          cellStyle += 'text-align:right;';
        }
        html.push('<td style="' + cellStyle + '">' + display + '</td>');
      });
      html.push('</tr>');
      html.push('</tfoot>');

      html.push('</table>');

      if (options.showPagination && rows.length > maxRows) {
        html.push(
          '<div class="subledger-pagination" style="margin-top:8px;font-size:0.85em;color:#555;">' +
          rows.length + ' total rows &mdash; pagination not yet implemented in static mode.' +
          '</div>'
        );
      }

      html.push('</div>');
      return html.join('\n');
    }

    // -------------------------------------------------------------------------
    // renderTrialBalanceHTML
    // -------------------------------------------------------------------------
    function renderTrialBalanceHTML(trialBalance) {
      var html = [];
      html.push('<div class="tb-wrapper">');
      html.push('<table class="tb-table" style="width:100%;border-collapse:collapse;font-size:0.875em;">');

      html.push('<thead>');
      html.push('<tr style="background:#1a237e;color:#fff;">');
      ['Account Code', 'Account Name', 'Account Type', 'Total Debit', 'Total Credit', 'Net Balance'].forEach(function (h) {
        var align = (h === 'Total Debit' || h === 'Total Credit' || h === 'Net Balance') ? 'right' : 'left';
        html.push('<th style="padding:7px 10px;text-align:' + align + ';border:1px solid #283593;">' + h + '</th>');
      });
      html.push('</tr>');
      html.push('</thead>');

      html.push('<tbody>');

      var grandDebit  = 0;
      var grandCredit = 0;
      var grandNet    = 0;

      trialBalance.forEach(function (acct, idx) {
        grandDebit  = round2(grandDebit  + acct.totalDebit);
        grandCredit = round2(grandCredit + acct.totalCredit);
        grandNet    = round2(grandNet    + acct.netBalance);

        var rowBg = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
        var netStyle = acct.netBalance > 0 ? 'color:#c62828;' :
                       acct.netBalance < 0 ? 'color:#2e7d32;' : '';

        html.push('<tr style="background:' + rowBg + ';">');
        html.push('<td style="padding:5px 10px;border:1px solid #e0e0e0;font-weight:bold;">' + escHtml(acct.accountCode) + '</td>');
        html.push('<td style="padding:5px 10px;border:1px solid #e0e0e0;">' + escHtml(acct.accountName) + '</td>');
        html.push('<td style="padding:5px 10px;border:1px solid #e0e0e0;">' + escHtml(acct.accountType) + '</td>');
        html.push('<td style="padding:5px 10px;border:1px solid #e0e0e0;text-align:right;background:#ffebee;color:#c62828;">' + fmtCurrency(acct.totalDebit) + '</td>');
        html.push('<td style="padding:5px 10px;border:1px solid #e0e0e0;text-align:right;background:#e8f5e9;color:#2e7d32;">' + fmtCurrency(acct.totalCredit) + '</td>');
        html.push('<td style="padding:5px 10px;border:1px solid #e0e0e0;text-align:right;' + netStyle + '">' + fmtCurrency(acct.netBalance) + '</td>');
        html.push('</tr>');
      });

      html.push('</tbody>');

      // Grand total footer
      var balanced = Math.abs(grandDebit - grandCredit) < 0.005;
      html.push('<tfoot>');
      html.push('<tr style="background:#e8eaf6;font-weight:bold;">');
      html.push('<td colspan="3" style="padding:7px 10px;border:1px solid #c5cae9;">GRAND TOTAL ' +
        (balanced ? '<span style="color:#2e7d32;">(Balanced &#10003;)</span>' : '<span style="color:#b71c1c;">(UNBALANCED &#9888;)</span>') +
        '</td>');
      html.push('<td style="padding:7px 10px;border:1px solid #c5cae9;text-align:right;background:#ffebee;color:#c62828;">' + fmtCurrency(grandDebit) + '</td>');
      html.push('<td style="padding:7px 10px;border:1px solid #c5cae9;text-align:right;background:#e8f5e9;color:#2e7d32;">' + fmtCurrency(grandCredit) + '</td>');
      html.push('<td style="padding:7px 10px;border:1px solid #c5cae9;text-align:right;">' + fmtCurrency(grandNet) + '</td>');
      html.push('</tr>');
      html.push('</tfoot>');

      html.push('</table>');
      html.push('</div>');
      return html.join('\n');
    }

    // -------------------------------------------------------------------------
    // renderStatsHTML
    // -------------------------------------------------------------------------
    function renderStatsHTML(stats) {
      function card(label, value, color) {
        return (
          '<div style="display:inline-block;min-width:160px;margin:6px;padding:14px 18px;' +
          'border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.15);vertical-align:top;">' +
          '<div style="font-size:0.75em;color:#555;text-transform:uppercase;letter-spacing:.04em;">' + escHtml(label) + '</div>' +
          '<div style="font-size:1.6em;font-weight:bold;color:' + color + ';margin-top:4px;">' + escHtml(String(value)) + '</div>' +
          '</div>'
        );
      }

      var balanced = Math.abs(stats.totalDebits - stats.totalCredits) < 0.005;

      var html = [];
      html.push('<div class="stats-cards" style="font-family:sans-serif;">');
      html.push(card('Total Line Items', stats.totalEntries, '#1a237e'));
      html.push(card('Posted',           stats.totalPosted,  '#2e7d32'));
      html.push(card('Pending',          stats.totalPending, '#e65100'));
      html.push(card('Total Debits',     '$' + fmtCurrency(stats.totalDebits),  '#c62828'));
      html.push(card('Total Credits',    '$' + fmtCurrency(stats.totalCredits), '#2e7d32'));
      html.push(card('Balanced',         balanced ? 'YES' : 'NO', balanced ? '#2e7d32' : '#b71c1c'));
      html.push('</div>');

      // Period breakdown mini-table
      if (stats.periodBreakdown && stats.periodBreakdown.length > 0) {
        html.push('<div style="margin-top:16px;">');
        html.push('<h4 style="font-family:sans-serif;margin:0 0 6px 0;color:#1a237e;">Period Breakdown</h4>');
        html.push('<table style="border-collapse:collapse;font-size:0.85em;font-family:monospace;">');
        html.push('<thead><tr style="background:#e8eaf6;">');
        ['Period', 'Line Items', 'Debits', 'Credits'].forEach(function (h) {
          html.push('<th style="padding:5px 10px;border:1px solid #c5cae9;text-align:left;">' + h + '</th>');
        });
        html.push('</tr></thead><tbody>');
        stats.periodBreakdown.forEach(function (p, idx) {
          var bg = idx % 2 === 0 ? '#f8f9fa' : '#fff';
          html.push('<tr style="background:' + bg + ';">');
          html.push('<td style="padding:4px 10px;border:1px solid #e0e0e0;">' + escHtml(p.period) + '</td>');
          html.push('<td style="padding:4px 10px;border:1px solid #e0e0e0;text-align:right;">' + p.count + '</td>');
          html.push('<td style="padding:4px 10px;border:1px solid #e0e0e0;text-align:right;color:#c62828;">' + fmtCurrency(p.debits) + '</td>');
          html.push('<td style="padding:4px 10px;border:1px solid #e0e0e0;text-align:right;color:#2e7d32;">' + fmtCurrency(p.credits) + '</td>');
          html.push('</tr>');
        });
        html.push('</tbody></table>');
        html.push('</div>');
      }

      // LOB breakdown mini-table
      if (stats.lobBreakdown && stats.lobBreakdown.length > 0) {
        html.push('<div style="margin-top:16px;">');
        html.push('<h4 style="font-family:sans-serif;margin:0 0 6px 0;color:#1a237e;">Line of Business Breakdown</h4>');
        html.push('<table style="border-collapse:collapse;font-size:0.85em;font-family:monospace;">');
        html.push('<thead><tr style="background:#e8eaf6;">');
        ['Line of Business', 'Line Items', 'Total Debits'].forEach(function (h) {
          html.push('<th style="padding:5px 10px;border:1px solid #c5cae9;text-align:left;">' + h + '</th>');
        });
        html.push('</tr></thead><tbody>');
        stats.lobBreakdown.forEach(function (l, idx) {
          var bg = idx % 2 === 0 ? '#f8f9fa' : '#fff';
          html.push('<tr style="background:' + bg + ';">');
          html.push('<td style="padding:4px 10px;border:1px solid #e0e0e0;">' + escHtml(l.lob) + '</td>');
          html.push('<td style="padding:4px 10px;border:1px solid #e0e0e0;text-align:right;">' + l.count + '</td>');
          html.push('<td style="padding:4px 10px;border:1px solid #e0e0e0;text-align:right;color:#c62828;">' + fmtCurrency(l.totalDebits) + '</td>');
          html.push('</tr>');
        });
        html.push('</tbody></table>');
        html.push('</div>');
      }

      return html.join('\n');
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    return {
      postJournalEntries:    postJournalEntries,
      query:                 query,
      getTrialBalance:       getTrialBalance,
      getPeriodSummary:      getPeriodSummary,
      getJournalEntryDetail: getJournalEntryDetail,
      getStats:              getStats,
      clear:                 clear,
      toSQL:                 toSQL,
      renderTableHTML:       renderTableHTML,
      renderTrialBalanceHTML: renderTrialBalanceHTML,
      renderStatsHTML:       renderStatsHTML,
      // Expose internal state for debugging
      _getEntries: function () { return _entries; }
    };
  }

  // ---------------------------------------------------------------------------
  // Expose on window
  // ---------------------------------------------------------------------------
  global.Subledger = {
    createSubledger: createSubledger
  };

}(typeof window !== 'undefined' ? window : this));
