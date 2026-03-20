/**
 * export.js
 * Browser-compatible ERP export module.
 * Converts subledger journal entry rows into various ERP import formats,
 * handles browser-side file download, validation, and manifest generation.
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  /**
   * Format a date string or Date object.
   * dateFormat: 'YYYY-MM-DD' (default) | 'MM/DD/YYYY'
   */
  function formatDate(val, dateFormat) {
    if (!val) return '';
    var d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return String(val);   // pass through if unparseable
    var yyyy = d.getFullYear();
    var mm   = String(d.getMonth() + 1).padStart(2, '0');
    var dd   = String(d.getDate()).padStart(2, '0');
    if (dateFormat === 'MM/DD/YYYY') return mm + '/' + dd + '/' + yyyy;
    return yyyy + '-' + mm + '-' + dd;
  }

  /** Escape a single CSV field value. */
  function csvField(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    // Wrap in quotes if the value contains comma, quote, newline, or leading/trailing space
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 ||
        s.indexOf('\n') !== -1 || s !== s.trim()) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** Build a CSV row string from an array of values. */
  function csvRow(values) {
    return values.map(csvField).join(',');
  }

  /** Simple deterministic checksum: sum of charCodes mod 1e9, hex-encoded. */
  function simpleChecksum(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash * 31) + str.charCodeAt(i)) >>> 0;  // keep as unsigned 32-bit
    }
    return hash.toString(16).toUpperCase().padStart(8, '0');
  }

  /** Generate a short random export ID. */
  function generateExportId() {
    var ts   = Date.now().toString(36).toUpperCase();
    var rand = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    return 'EXP-' + ts + '-' + rand;
  }

  // ---------------------------------------------------------------------------
  // Column definitions per format
  // ---------------------------------------------------------------------------

  var FORMAT_DEFS = {

    standard: {
      headers: [
        'je_id', 'je_date', 'period', 'policy_number', 'line_of_business',
        'transaction_type', 'rule_id', 'rule_name', 'description',
        'account_code', 'account_name', 'account_type',
        'debit', 'credit', 'net_amount',
        'ledger', 'source', 'status',
        'created_at', 'posted_at', 'batch_id'
      ],
      mapRow: function (entry, dateFormat) {
        return [
          entry.je_id,
          formatDate(entry.je_date, dateFormat),
          entry.period,
          entry.policy_number,
          entry.line_of_business,
          entry.transaction_type,
          entry.rule_id,
          entry.rule_name,
          entry.description,
          entry.account_code,
          entry.account_name,
          entry.account_type,
          entry.debit,
          entry.credit,
          entry.net_amount,
          entry.ledger,
          entry.source,
          entry.status,
          entry.created_at,
          entry.posted_at,
          entry.batch_id
        ];
      }
    },

    sap_gl: {
      // SAP FI Document Interface (simplified BAPI_ACC_DOCUMENT_POST-style fields)
      headers: [
        'CompanyCode', 'FiscalYear', 'Period', 'DocumentDate', 'PostingDate',
        'DocumentType', 'Account', 'CostCenter', 'Amount', 'Currency',
        'Text', 'Reference'
      ],
      mapRow: function (entry, dateFormat) {
        var dt = entry.je_date ? new Date(entry.je_date) : null;
        var fiscalYear = dt ? String(dt.getFullYear()) : '';
        // SAP period is 1-12
        var sapPeriod  = dt ? String(dt.getMonth() + 1).padStart(2, '0') : '';
        // SAP document type: SA = G/L account posting
        var docType = 'SA';
        // Amount: SAP uses signed amount (positive = debit, negative = credit)
        var amount = round2((entry.debit || 0) - (entry.credit || 0));
        return [
          'GCNA',                                          // CompanyCode  — placeholder
          fiscalYear,
          sapPeriod,
          formatDate(entry.je_date, dateFormat),           // DocumentDate
          formatDate(entry.je_date, dateFormat),           // PostingDate
          docType,
          entry.account_code,
          '',                                              // CostCenter — not captured
          amount,
          'USD',
          entry.description,
          entry.je_id
        ];
      }
    },

    oracle_gl: {
      // Oracle General Ledger Journal Import interface table fields
      headers: [
        'LEDGER_NAME', 'PERIOD_NAME', 'ACCOUNT', 'DR_CR_FLAG',
        'AMOUNT', 'DESCRIPTION', 'REFERENCE', 'SOURCE'
      ],
      mapRow: function (entry, dateFormat) {  // dateFormat unused but kept for signature parity
        void dateFormat;
        // Oracle period name format: e.g., 'Jan-26'
        var oraclePeriod = '';
        if (entry.period) {
          var parts = entry.period.split('-');
          if (parts.length === 2) {
            var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            var mIdx = parseInt(parts[1], 10) - 1;
            oraclePeriod = months[mIdx] + '-' + String(parts[0]).slice(-2);
          } else {
            oraclePeriod = entry.period;
          }
        }

        // Oracle uses separate debit / credit rows
        // We flatten: if debit > 0 emit DR row; if credit > 0 emit CR row.
        // Since each entry row may have both, we pick the dominant side.
        var drCrFlag, amount;
        if ((entry.debit || 0) >= (entry.credit || 0)) {
          drCrFlag = 'DR';
          amount   = entry.debit || 0;
        } else {
          drCrFlag = 'CR';
          amount   = entry.credit || 0;
        }

        return [
          'Primary Ledger',
          oraclePeriod,
          entry.account_code,
          drCrFlag,
          round2(amount),
          entry.description,
          entry.je_id,
          entry.source || 'GWPC'
        ];
      }
    },

    dynamics365: {
      // Microsoft Dynamics 365 Finance General Journal import format
      headers: [
        'JOURNALNAME', 'DATE', 'ACCOUNT', 'DESCRIPTION',
        'DEBIT', 'CREDIT', 'OFFSETACCOUNT', 'CURRENCY'
      ],
      mapRow: function (entry, dateFormat) {
        return [
          entry.batch_id || 'GJ-IMPORT',
          formatDate(entry.je_date, dateFormat),
          entry.account_code,
          entry.description,
          entry.debit   || 0,
          entry.credit  || 0,
          '',                   // OFFSETACCOUNT — not captured in subledger rows
          'USD'
        ];
      }
    }
  };

  // ---------------------------------------------------------------------------
  // toCSV
  // ---------------------------------------------------------------------------
  /**
   * Convert an array of subledger entry rows to a CSV string.
   *
   * options: {
   *   format: 'standard' | 'sap_gl' | 'oracle_gl' | 'dynamics365'  (default: 'standard')
   *   includeHeaders: boolean  (default: true)
   *   dateFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY'  (default: 'YYYY-MM-DD')
   * }
   */
  function toCSV(entries, options) {
    options = options || {};
    var format     = options.format      || 'standard';
    var inclHdr    = options.includeHeaders !== false;
    var dateFmt    = options.dateFormat   || 'YYYY-MM-DD';

    var def = FORMAT_DEFS[format];
    if (!def) {
      throw new Error('Unknown export format: ' + format + '. Must be one of: ' + Object.keys(FORMAT_DEFS).join(', '));
    }

    var lines = [];

    if (inclHdr) {
      lines.push(csvRow(def.headers));
    }

    entries.forEach(function (entry) {
      lines.push(csvRow(def.mapRow(entry, dateFmt)));
    });

    return lines.join('\r\n');
  }

  // ---------------------------------------------------------------------------
  // downloadCSV
  // ---------------------------------------------------------------------------
  /**
   * Trigger a browser download of a CSV string.
   * filename defaults to 'export.csv'.
   */
  function downloadCSV(csvString, filename) {
    filename = filename || 'export.csv';
    var blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href        = url;
    a.download    = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Clean up
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ---------------------------------------------------------------------------
  // toJSON
  // ---------------------------------------------------------------------------
  /** Return a pretty-printed JSON string of the entries array. */
  function toJSON(entries) {
    return JSON.stringify(entries, null, 2);
  }

  // ---------------------------------------------------------------------------
  // generateExportManifest
  // ---------------------------------------------------------------------------
  /**
   * Returns {
   *   exportId, exportDate, format, recordCount,
   *   totalDebits, totalCredits, balanced, periods, checksum
   * }
   */
  function generateExportManifest(entries, format) {
    var totalDebits  = 0;
    var totalCredits = 0;
    var periodSet    = {};

    entries.forEach(function (e) {
      totalDebits  = round2(totalDebits  + (e.debit  || 0));
      totalCredits = round2(totalCredits + (e.credit || 0));
      if (e.period) periodSet[e.period] = true;
    });

    var balanced = Math.abs(totalDebits - totalCredits) < 0.005;
    var checksumSrc = [entries.length, totalDebits, totalCredits].join('|');

    return {
      exportId:    generateExportId(),
      exportDate:  new Date().toISOString(),
      format:      format || 'standard',
      recordCount: entries.length,
      totalDebits:  totalDebits,
      totalCredits: totalCredits,
      balanced:    balanced,
      periods:     Object.keys(periodSet).sort(),
      checksum:    simpleChecksum(checksumSrc)
    };
  }

  // ---------------------------------------------------------------------------
  // validateExport
  // ---------------------------------------------------------------------------
  /**
   * Returns { valid: boolean, warnings: string[], errors: string[] }
   */
  function validateExport(entries) {
    var errors   = [];
    var warnings = [];

    if (!Array.isArray(entries) || entries.length === 0) {
      errors.push('No entries to export.');
      return { valid: false, warnings: warnings, errors: errors };
    }

    // Check all entries are posted
    var nonPosted = entries.filter(function (e) { return e.status !== 'posted'; });
    if (nonPosted.length > 0) {
      errors.push(
        nonPosted.length + ' entr' + (nonPosted.length === 1 ? 'y is' : 'ies are') +
        ' not in "posted" status and cannot be exported.'
      );
    }

    // Check debits == credits (balanced)
    var totalDebits  = 0;
    var totalCredits = 0;
    entries.forEach(function (e) {
      totalDebits  = round2(totalDebits  + (e.debit  || 0));
      totalCredits = round2(totalCredits + (e.credit || 0));
    });
    if (Math.abs(totalDebits - totalCredits) >= 0.005) {
      errors.push(
        'Export is not balanced. Total debits ' + totalDebits.toFixed(2) +
        ' != total credits ' + totalCredits.toFixed(2) +
        ' (difference: ' + Math.abs(totalDebits - totalCredits).toFixed(2) + ').'
      );
    }

    // Check no null account codes
    var missingAcct = entries.filter(function (e) { return !e.account_code; });
    if (missingAcct.length > 0) {
      errors.push(missingAcct.length + ' row(s) have a null or missing account_code.');
    }

    // Warn if mix of periods
    var periodSet = {};
    entries.forEach(function (e) { if (e.period) periodSet[e.period] = true; });
    var periods = Object.keys(periodSet);
    if (periods.length > 1) {
      warnings.push(
        'Export spans ' + periods.length + ' periods (' + periods.sort().join(', ') + '). ' +
        'Verify this is intentional before importing into your ERP.'
      );
    }

    // Warn if there are duplicate je_id + account_code combos that might indicate duplicates
    var seen = {};
    entries.forEach(function (e) {
      var key = (e.je_id || '') + '|' + (e.account_code || '') + '|' + (e.debit || 0) + '|' + (e.credit || 0);
      if (seen[key]) {
        warnings.push('Possible duplicate row detected for JE ' + e.je_id + ' / account ' + e.account_code + '.');
        seen[key]++;   // count but don't spam
      } else {
        seen[key] = 1;
      }
    });

    // De-duplicate warnings (duplicate detection can fire multiple times)
    warnings = warnings.filter(function (w, i) { return warnings.indexOf(w) === i; });

    return {
      valid:    errors.length === 0,
      warnings: warnings,
      errors:   errors
    };
  }

  // ---------------------------------------------------------------------------
  // exportSubledger
  // ---------------------------------------------------------------------------
  /**
   * High-level convenience function.
   *
   * options: {
   *   filters:    {}     — passed to subledgerStore.query()
   *   format:     string — CSV format key (default: 'standard')
   *   dateFormat: string — date format for CSV
   *   filename:   string — download filename (auto-generated if omitted)
   *   skipValidation: boolean
   * }
   *
   * Returns: { manifest, validation } — does NOT return the raw CSV string
   *   (the file is downloaded as a side-effect).
   */
  function exportSubledger(subledgerStore, options) {
    options = options || {};

    if (!subledgerStore || typeof subledgerStore.query !== 'function') {
      throw new Error('exportSubledger: first argument must be a SubledgerStore instance.');
    }

    // 1. Query
    var entries = subledgerStore.query(options.filters || {});

    // 2. Validate
    var validation = options.skipValidation ? { valid: true, warnings: [], errors: [] } : validateExport(entries);

    if (!validation.valid) {
      console.warn('[ERPExport] Validation failed:', validation.errors);
      // Surface errors in the returned object — caller decides whether to abort
    }

    // 3. Generate manifest
    var format   = options.format || 'standard';
    var manifest = generateExportManifest(entries, format);

    // 4. Convert to CSV
    var csvString = toCSV(entries, {
      format:         format,
      includeHeaders: options.includeHeaders !== false,
      dateFormat:     options.dateFormat || 'YYYY-MM-DD'
    });

    // 5. Build filename
    var filename = options.filename;
    if (!filename) {
      var ts = new Date().toISOString().slice(0, 10);
      filename = 'subledger_export_' + format + '_' + ts + '.csv';
    }

    // 6. Download
    downloadCSV(csvString, filename);

    return { manifest: manifest, validation: validation };
  }

  // ---------------------------------------------------------------------------
  // Expose on window
  // ---------------------------------------------------------------------------
  global.ERPExport = {
    toCSV:                  toCSV,
    downloadCSV:            downloadCSV,
    toJSON:                 toJSON,
    generateExportManifest: generateExportManifest,
    validateExport:         validateExport,
    exportSubledger:        exportSubledger
  };

}(typeof window !== 'undefined' ? window : this));
