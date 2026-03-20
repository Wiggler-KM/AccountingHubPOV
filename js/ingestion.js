/**
 * ingestion.js
 * Guidewire PolicyCenter CSV ingestion module.
 * Browser-compatible — no Node.js require/import.
 * Exported on window.GWPCIngestion.
 */

(function (global) {
  'use strict';

  // ─── Schema ────────────────────────────────────────────────────────────────

  var GWPC_SCHEMA = {
    requiredFields: [
      'PolicyNumber', 'LineOfBusiness', 'PolicyType', 'EffectiveDate',
      'ExpirationDate', 'InceptionDate', 'TransactionID', 'TransactionType',
      'TransactionDate', 'PolicyStatus', 'UnderwritingCompany', 'Agency',
      'AgencyCode', 'InsuredName', 'State', 'ZipCode', 'GrossPremium',
      'Tax', 'Fees', 'NetPremium', 'Commission', 'LossReserve',
      'UnearnedPremium', 'EarnedPremium', 'CoverageCode', 'CoverageLimit',
      'Deductible'
    ],
    fieldTypes: {
      PolicyNumber:        'string',
      LineOfBusiness:      'string',
      PolicyType:          'string',
      EffectiveDate:       'date',
      ExpirationDate:      'date',
      InceptionDate:       'date',
      TransactionID:       'string',
      TransactionType:     'string',
      TransactionDate:     'date',
      PolicyStatus:        'string',
      UnderwritingCompany: 'string',
      Agency:              'string',
      AgencyCode:          'string',
      InsuredName:         'string',
      State:               'string',
      ZipCode:             'string',
      GrossPremium:        'number',
      Tax:                 'number',
      Fees:                'number',
      NetPremium:          'number',
      Commission:          'number',
      LossReserve:         'number',
      UnearnedPremium:     'number',
      EarnedPremium:       'number',
      CoverageCode:        'string',
      CoverageLimit:       'number',
      Deductible:          'number'
    },
    lookupTables: {
      lineOfBusiness:  ['PersonalAuto', 'HomeOwners', 'CommercialProperty', 'WorkersComp', 'GeneralLiability'],
      transactionType: ['New Business', 'Renewal', 'Endorsement', 'Cancellation'],
      policyStatus:    ['Active', 'Cancelled', 'Expired', 'Pending'],
      coverageCode:    ['BI', 'PD', 'COMP', 'COLL', 'GL', 'PROP', 'WC', 'UM/UIM']
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Cast a raw string value to the target type defined in fieldTypes.
   * Returns { value, error } — error is null on success.
   */
  function castField(fieldName, rawValue) {
    var type = GWPC_SCHEMA.fieldTypes[fieldName];
    if (type === undefined) {
      return { value: rawValue, error: null };
    }

    var trimmed = (rawValue || '').trim();

    if (type === 'string') {
      return { value: trimmed, error: null };
    }

    if (type === 'number') {
      var num = parseFloat(trimmed);
      if (isNaN(num)) {
        return { value: null, error: 'Field "' + fieldName + '" is not a valid number: "' + trimmed + '"' };
      }
      return { value: num, error: null };
    }

    if (type === 'date') {
      if (!trimmed) {
        return { value: null, error: 'Field "' + fieldName + '" has an empty date value' };
      }
      var d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        return { value: null, error: 'Field "' + fieldName + '" is not a valid date: "' + trimmed + '"' };
      }
      return { value: d, error: null };
    }

    return { value: trimmed, error: null };
  }

  /**
   * Parse a single CSV line respecting double-quoted fields that may contain commas.
   */
  function parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  // ─── validateRow ──────────────────────────────────────────────────────────

  /**
   * Validate a single parsed+cast row object.
   * @param {Object} row       - Object with field names as keys, cast values as values.
   * @param {number} rowIndex  - 1-based row number (excluding header) for error messages.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateRow(row, rowIndex) {
    var errors = [];
    var prefix = 'Row ' + rowIndex + ': ';

    // 1. Required fields present and non-empty
    GWPC_SCHEMA.requiredFields.forEach(function (field) {
      var val = row[field];
      if (val === null || val === undefined || val === '') {
        errors.push(prefix + 'Missing required field "' + field + '"');
      }
    });

    // 2. Numeric fields must be parseable (already cast, but check for null)
    var numericFields = Object.keys(GWPC_SCHEMA.fieldTypes).filter(function (f) {
      return GWPC_SCHEMA.fieldTypes[f] === 'number';
    });
    numericFields.forEach(function (field) {
      if (row[field] === null) {
        errors.push(prefix + 'Field "' + field + '" must be a valid number');
      }
    });

    // 3. Date fields must be valid dates (already cast, check for null)
    var dateFields = Object.keys(GWPC_SCHEMA.fieldTypes).filter(function (f) {
      return GWPC_SCHEMA.fieldTypes[f] === 'date';
    });
    dateFields.forEach(function (field) {
      if (row[field] === null) {
        errors.push(prefix + 'Field "' + field + '" must be a valid date');
      }
    });

    // 4. Lookup validation
    if (row.LineOfBusiness && GWPC_SCHEMA.lookupTables.lineOfBusiness.indexOf(row.LineOfBusiness) === -1) {
      errors.push(prefix + 'Invalid LineOfBusiness "' + row.LineOfBusiness + '". Allowed: ' + GWPC_SCHEMA.lookupTables.lineOfBusiness.join(', '));
    }
    if (row.TransactionType && GWPC_SCHEMA.lookupTables.transactionType.indexOf(row.TransactionType) === -1) {
      errors.push(prefix + 'Invalid TransactionType "' + row.TransactionType + '". Allowed: ' + GWPC_SCHEMA.lookupTables.transactionType.join(', '));
    }
    if (row.PolicyStatus && GWPC_SCHEMA.lookupTables.policyStatus.indexOf(row.PolicyStatus) === -1) {
      errors.push(prefix + 'Invalid PolicyStatus "' + row.PolicyStatus + '". Allowed: ' + GWPC_SCHEMA.lookupTables.policyStatus.join(', '));
    }
    if (row.CoverageCode && GWPC_SCHEMA.lookupTables.coverageCode.indexOf(row.CoverageCode) === -1) {
      errors.push(prefix + 'Invalid CoverageCode "' + row.CoverageCode + '". Allowed: ' + GWPC_SCHEMA.lookupTables.coverageCode.join(', '));
    }

    // 5. Positive-value checks for financial fields (allow negatives only for Cancellations)
    var financialFields = ['GrossPremium', 'Tax', 'Fees', 'NetPremium', 'Commission', 'LossReserve', 'UnearnedPremium', 'EarnedPremium', 'CoverageLimit'];
    if (row.PolicyType !== 'Cancellation') {
      financialFields.forEach(function (field) {
        if (typeof row[field] === 'number' && row[field] < 0) {
          errors.push(prefix + 'Field "' + field + '" should be non-negative for non-cancellation transactions (value: ' + row[field] + ')');
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  // ─── parseCSV ─────────────────────────────────────────────────────────────

  /**
   * Parse a complete CSV text string.
   * @param {string} csvText
   * @returns {{ rows: Object[], errors: string[], stats: Object }}
   */
  function parseCSV(csvText) {
    var allErrors = [];
    var validRows = [];
    var allRows = [];

    // Normalize line endings
    var lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Remove trailing empty lines
    while (lines.length && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    if (lines.length === 0) {
      return { rows: [], errors: ['CSV file is empty'], stats: {} };
    }

    // Parse header
    var headers = parseCSVLine(lines[0]).map(function (h) { return h.trim(); });

    // Validate that required fields exist in the header
    GWPC_SCHEMA.requiredFields.forEach(function (field) {
      if (headers.indexOf(field) === -1) {
        allErrors.push('Header missing required column: "' + field + '"');
      }
    });

    // Build breakdown accumulators
    var lobBreakdown = {};
    var txnBreakdown = {};

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var rowIndex = i; // 1-based data row number
      var values = parseCSVLine(line);
      var rawRow = {};
      headers.forEach(function (header, idx) {
        rawRow[header] = values[idx] !== undefined ? values[idx].trim() : '';
      });

      // Cast each field
      var castRow = {};
      var castErrors = [];
      headers.forEach(function (header) {
        var result = castField(header, rawRow[header]);
        castRow[header] = result.value;
        if (result.error) {
          castErrors.push('Row ' + rowIndex + ': ' + result.error);
        }
      });

      // Validate
      var validation = validateRow(castRow, rowIndex);
      var rowErrors = castErrors.concat(validation.errors);

      allRows.push({ row: castRow, errors: rowErrors });
      allErrors = allErrors.concat(rowErrors);

      if (rowErrors.length === 0) {
        validRows.push(castRow);
      }

      // Accumulate breakdowns
      var lob = castRow.LineOfBusiness || 'Unknown';
      var txn = castRow.TransactionType || 'Unknown';
      var gross = typeof castRow.GrossPremium === 'number' ? castRow.GrossPremium : 0;

      if (!lobBreakdown[lob]) lobBreakdown[lob] = { count: 0, totalGross: 0 };
      lobBreakdown[lob].count++;
      lobBreakdown[lob].totalGross += gross;

      if (!txnBreakdown[txn]) txnBreakdown[txn] = { count: 0 };
      txnBreakdown[txn].count++;
    }

    var totalRows = allRows.length;
    var errorRows = allRows.filter(function (r) { return r.errors.length > 0; }).length;

    // Compute date range from valid rows
    var dates = validRows
      .map(function (r) { return r.EffectiveDate; })
      .filter(function (d) { return d instanceof Date && !isNaN(d.getTime()); })
      .sort(function (a, b) { return a - b; });
    var dateRangeMin = dates.length ? dates[0] : null;
    var dateRangeMax = dates.length ? dates[dates.length - 1] : null;

    var stats = {
      totalRows: totalRows,
      validRows: validRows.length,
      errorRows: errorRows,
      lineOfBusinessBreakdown: lobBreakdown,
      transactionTypeBreakdown: txnBreakdown,
      dateRange: {
        earliest: dateRangeMin,
        latest:   dateRangeMax
      }
    };

    return {
      rows: validRows,
      errors: allErrors,
      stats: stats
    };
  }

  // ─── buildIngestionReport ─────────────────────────────────────────────────

  /**
   * Build an HTML string summarising a parseCSV result.
   * @param {{ rows: Object[], errors: string[], stats: Object }} parseResult
   * @returns {string} HTML
   */
  function buildIngestionReport(parseResult) {
    var stats = parseResult.stats || {};
    var errors = parseResult.errors || [];

    var formatDate = function (d) {
      if (!d) return 'N/A';
      if (!(d instanceof Date)) return String(d);
      return d.toISOString().slice(0, 10);
    };

    var formatCurrency = function (n) {
      if (typeof n !== 'number') return '$0.00';
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    var escapeHtml = function (str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    // Summary cards
    var html = '<div class="ingestion-report">';
    html += '<h2 class="report-title">Ingestion Report &mdash; Guidewire PolicyCenter</h2>';

    html += '<div class="report-summary-cards">';

    var cards = [
      { label: 'Total Rows',   value: stats.totalRows  || 0, cls: 'card-neutral'  },
      { label: 'Valid Rows',   value: stats.validRows  || 0, cls: 'card-success'  },
      { label: 'Error Rows',   value: stats.errorRows  || 0, cls: (stats.errorRows || 0) > 0 ? 'card-danger' : 'card-success' },
      {
        label: 'Date Range',
        value: formatDate(stats.dateRange && stats.dateRange.earliest) +
               ' &ndash; ' +
               formatDate(stats.dateRange && stats.dateRange.latest),
        cls: 'card-info'
      }
    ];

    cards.forEach(function (card) {
      html += '<div class="summary-card ' + card.cls + '">';
      html += '<div class="card-value">' + card.value + '</div>';
      html += '<div class="card-label">' + card.label + '</div>';
      html += '</div>';
    });

    html += '</div>'; // .report-summary-cards

    // Line of Business breakdown table
    var lob = stats.lineOfBusinessBreakdown || {};
    var lobKeys = Object.keys(lob).sort();

    html += '<h3 class="report-section-title">Line of Business Breakdown</h3>';
    html += '<table class="report-table">';
    html += '<thead><tr>';
    html += '<th>Line of Business</th><th>Policy Count</th><th>Total Gross Premium</th>';
    html += '</tr></thead><tbody>';

    if (lobKeys.length === 0) {
      html += '<tr><td colspan="3"><em>No data available</em></td></tr>';
    } else {
      lobKeys.forEach(function (key) {
        var entry = lob[key];
        html += '<tr>';
        html += '<td>' + escapeHtml(key) + '</td>';
        html += '<td>' + entry.count + '</td>';
        html += '<td>' + formatCurrency(entry.totalGross) + '</td>';
        html += '</tr>';
      });

      // Totals row
      var totalCount = lobKeys.reduce(function (sum, k) { return sum + lob[k].count; }, 0);
      var totalGross = lobKeys.reduce(function (sum, k) { return sum + lob[k].totalGross; }, 0);
      html += '<tr class="totals-row">';
      html += '<td><strong>Total</strong></td>';
      html += '<td><strong>' + totalCount + '</strong></td>';
      html += '<td><strong>' + formatCurrency(totalGross) + '</strong></td>';
      html += '</tr>';
    }

    html += '</tbody></table>';

    // Transaction type breakdown
    var txn = stats.transactionTypeBreakdown || {};
    var txnKeys = Object.keys(txn).sort();

    html += '<h3 class="report-section-title">Transaction Type Breakdown</h3>';
    html += '<table class="report-table">';
    html += '<thead><tr><th>Transaction Type</th><th>Count</th></tr></thead><tbody>';

    if (txnKeys.length === 0) {
      html += '<tr><td colspan="2"><em>No data available</em></td></tr>';
    } else {
      txnKeys.forEach(function (key) {
        html += '<tr><td>' + escapeHtml(key) + '</td><td>' + txn[key].count + '</td></tr>';
      });
    }

    html += '</tbody></table>';

    // Top 5 errors
    html += '<h3 class="report-section-title">Top Errors</h3>';

    if (errors.length === 0) {
      html += '<p class="no-errors">No errors detected.</p>';
    } else {
      // Deduplicate and count
      var errorMap = {};
      errors.forEach(function (err) {
        // Normalize row-specific messages to a generic form for grouping
        var normalized = err.replace(/Row \d+:/g, 'Row N:');
        errorMap[normalized] = (errorMap[normalized] || 0) + 1;
      });

      var sorted = Object.keys(errorMap).sort(function (a, b) {
        return errorMap[b] - errorMap[a];
      });
      var top5 = sorted.slice(0, 5);

      html += '<ol class="error-list">';
      top5.forEach(function (msg) {
        html += '<li><span class="error-msg">' + escapeHtml(msg) + '</span>';
        html += ' <span class="error-count">(' + errorMap[msg] + 'x)</span></li>';
      });
      html += '</ol>';
    }

    html += '</div>'; // .ingestion-report
    return html;
  }

  // ─── loadSampleData ───────────────────────────────────────────────────────

  /**
   * Fetch and parse the bundled sample CSV.
   * @returns {Promise<{ rows: Object[], errors: string[], stats: Object }>}
   */
  function loadSampleData() {
    return fetch('./data/guidewire_policy_center.csv')
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to fetch sample data: HTTP ' + response.status + ' ' + response.statusText);
        }
        return response.text();
      })
      .then(function (text) {
        return parseCSV(text);
      });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  global.GWPCIngestion = {
    GWPC_SCHEMA:         GWPC_SCHEMA,
    parseCSV:            parseCSV,
    validateRow:         validateRow,
    buildIngestionReport: buildIngestionReport,
    loadSampleData:      loadSampleData
  };

}(window));
