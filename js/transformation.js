/**
 * transformation.js
 * Insurance Accounting Data Model and transformation layer.
 * Browser-compatible — no Node.js require/import.
 * Exported on window.InsuranceTransformation.
 */

(function (global) {
  'use strict';

  // ─── Insurance Account Definitions ───────────────────────────────────────

  var INSURANCE_ACCOUNTS = {
    // Assets
    'CASH': {
      code: '1000',
      name: 'Cash and Cash Equivalents',
      type: 'Asset',
      normalBalance: 'Debit'
    },
    'PREM_RECV': {
      code: '1100',
      name: 'Premiums Receivable',
      type: 'Asset',
      normalBalance: 'Debit'
    },
    'DEFER_ACQ': {
      code: '1200',
      name: 'Deferred Acquisition Costs',
      type: 'Asset',
      normalBalance: 'Debit'
    },
    // Liabilities
    'UNEARNED_PREM': {
      code: '2000',
      name: 'Unearned Premium Reserve',
      type: 'Liability',
      normalBalance: 'Credit'
    },
    'LOSS_RESERVE': {
      code: '2100',
      name: 'Loss and LAE Reserve',
      type: 'Liability',
      normalBalance: 'Credit'
    },
    'COMM_PAYABLE': {
      code: '2200',
      name: 'Commission Payable',
      type: 'Liability',
      normalBalance: 'Credit'
    },
    'TAX_PAYABLE': {
      code: '2300',
      name: 'Premium Tax Payable',
      type: 'Liability',
      normalBalance: 'Credit'
    },
    // Revenue
    'WRITTEN_PREM': {
      code: '4000',
      name: 'Written Premium',
      type: 'Revenue',
      normalBalance: 'Credit'
    },
    'EARNED_PREM': {
      code: '4100',
      name: 'Earned Premium',
      type: 'Revenue',
      normalBalance: 'Credit'
    },
    // Expenses
    'COMM_EXP': {
      code: '5000',
      name: 'Commission Expense',
      type: 'Expense',
      normalBalance: 'Debit'
    },
    'TAX_EXP': {
      code: '5100',
      name: 'Premium Tax Expense',
      type: 'Expense',
      normalBalance: 'Debit'
    },
    'LOSS_EXP': {
      code: '5200',
      name: 'Loss Expense',
      type: 'Expense',
      normalBalance: 'Debit'
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Simple incrementing event ID counter. */
  var _eventCounter = 0;

  function generateEventId(policyNumber) {
    _eventCounter++;
    var ts = Date.now();
    var seq = String(_eventCounter).padStart(6, '0');
    var pol = (policyNumber || 'UNKNOWN').replace(/[^A-Z0-9]/gi, '');
    return 'EVT-' + pol + '-' + ts + '-' + seq;
  }

  /**
   * Derive the canonical eventType from the row's TransactionType and PolicyStatus.
   */
  function deriveEventType(row) {
    var txn = (row.TransactionType || '').trim();
    var status = (row.PolicyStatus || '').trim();

    if (txn === 'Cancellation' || status === 'Cancelled') {
      return 'POLICY_CANCELLED';
    }
    if (txn === 'Endorsement') {
      return 'ENDORSEMENT';
    }
    if (txn === 'Renewal') {
      return 'POLICY_WRITTEN';   // Renewals are new written-premium transactions
    }
    if (txn === 'New Business') {
      return 'POLICY_WRITTEN';
    }
    // Fallback: treat as an earning event if earned premium is the dominant figure
    return 'POLICY_EARNED';
  }

  /**
   * Safely coerce a value to a number; returns 0 for null/undefined/NaN.
   */
  function toNum(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  /**
   * Convert a value to a Date, returning null if invalid.
   */
  function toDate(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // ─── transformPolicyRow ───────────────────────────────────────────────────

  /**
   * Transform a single parsed CSV row into a PolicyEvent object.
   *
   * @param {Object} row - A row object as produced by GWPCIngestion.parseCSV.
   * @returns {Object} PolicyEvent
   */
  function transformPolicyRow(row) {
    var grossPremium   = toNum(row.GrossPremium);
    var netPremium     = toNum(row.NetPremium);
    var unearnedPremium = toNum(row.UnearnedPremium);
    var earnedPremium  = toNum(row.EarnedPremium);
    var commission     = toNum(row.Commission);
    var tax            = toNum(row.Tax);
    var fees           = toNum(row.Fees);
    var lossReserve    = toNum(row.LossReserve);

    var accountingDate = toDate(row.TransactionDate) || toDate(row.EffectiveDate) || new Date();

    var eventType = deriveEventType(row);

    return {
      eventId:         generateEventId(row.PolicyNumber),
      eventType:       eventType,
      source:          'GWPC',
      policyNumber:    row.PolicyNumber    || '',
      lineOfBusiness:  row.LineOfBusiness  || '',
      transactionType: row.TransactionType || '',
      accountingDate:  accountingDate,
      amounts: {
        grossPremium:    grossPremium,
        netPremium:      netPremium,
        unearnedPremium: unearnedPremium,
        earnedPremium:   earnedPremium,
        commission:      commission,
        tax:             tax,
        fees:            fees,
        lossReserve:     lossReserve
      },
      metadata: {
        policyType:          row.PolicyType          || '',
        effectiveDate:       toDate(row.EffectiveDate),
        expirationDate:      toDate(row.ExpirationDate),
        inceptionDate:       toDate(row.InceptionDate),
        transactionId:       row.TransactionID        || '',
        policyStatus:        row.PolicyStatus         || '',
        underwritingCompany: row.UnderwritingCompany  || '',
        agency:              row.Agency               || '',
        agencyCode:          row.AgencyCode           || '',
        insuredName:         row.InsuredName          || '',
        state:               row.State                || '',
        zipCode:             row.ZipCode              || '',
        coverageCode:        row.CoverageCode         || '',
        coverageLimit:       toNum(row.CoverageLimit),
        deductible:          toNum(row.Deductible)
      }
    };
  }

  // ─── transformAll ─────────────────────────────────────────────────────────

  /**
   * Map all parsed rows through transformPolicyRow.
   *
   * @param {Object[]} parsedRows - Array of row objects from GWPCIngestion.parseCSV.
   * @returns {Object[]} Array of PolicyEvent objects.
   */
  function transformAll(parsedRows) {
    if (!Array.isArray(parsedRows)) return [];
    return parsedRows.map(function (row) {
      return transformPolicyRow(row);
    });
  }

  // ─── summarizeByLineOfBusiness ────────────────────────────────────────────

  /**
   * Aggregate transformed events by Line of Business.
   *
   * @param {Object[]} events - Array of PolicyEvent objects.
   * @returns {Object[]} Array of LOB summary objects, sorted by LOB name.
   *   Each entry: { lob, eventCount, totalGross, totalEarned, totalUnearned, totalCommission }
   */
  function summarizeByLineOfBusiness(events) {
    if (!Array.isArray(events) || events.length === 0) return [];

    var map = {};

    events.forEach(function (event) {
      var lob = event.lineOfBusiness || 'Unknown';
      if (!map[lob]) {
        map[lob] = {
          lob:              lob,
          eventCount:       0,
          totalGross:       0,
          totalEarned:      0,
          totalUnearned:    0,
          totalCommission:  0
        };
      }
      var entry = map[lob];
      var amounts = event.amounts || {};

      entry.eventCount++;
      entry.totalGross      += toNum(amounts.grossPremium);
      entry.totalEarned     += toNum(amounts.earnedPremium);
      entry.totalUnearned   += toNum(amounts.unearnedPremium);
      entry.totalCommission += toNum(amounts.commission);
    });

    return Object.keys(map)
      .sort()
      .map(function (key) { return map[key]; });
  }

  // ─── getTransformationStats ───────────────────────────────────────────────

  /**
   * Compute aggregate statistics across all transformed events.
   *
   * @param {Object[]} events - Array of PolicyEvent objects.
   * @returns {Object} Stats summary.
   */
  function getTransformationStats(events) {
    var defaultStats = {
      totalEvents:          0,
      totalGWP:             0,
      totalEarnedPremium:   0,
      totalUnearnedPremium: 0,
      totalCommission:      0,
      totalTax:             0,
      totalLossReserve:     0
    };

    if (!Array.isArray(events) || events.length === 0) {
      return defaultStats;
    }

    return events.reduce(function (acc, event) {
      var amounts = event.amounts || {};
      acc.totalEvents++;
      acc.totalGWP             += toNum(amounts.grossPremium);
      acc.totalEarnedPremium   += toNum(amounts.earnedPremium);
      acc.totalUnearnedPremium += toNum(amounts.unearnedPremium);
      acc.totalCommission      += toNum(amounts.commission);
      acc.totalTax             += toNum(amounts.tax);
      acc.totalLossReserve     += toNum(amounts.lossReserve);
      return acc;
    }, defaultStats);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  global.InsuranceTransformation = {
    INSURANCE_ACCOUNTS:          INSURANCE_ACCOUNTS,
    transformPolicyRow:          transformPolicyRow,
    transformAll:                transformAll,
    summarizeByLineOfBusiness:   summarizeByLineOfBusiness,
    getTransformationStats:      getTransformationStats
  };

}(window));
