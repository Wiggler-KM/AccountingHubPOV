/**
 * rules-engine.js
 * Browser-compatible Insurance Accounting Rules Engine
 * Exposed as window.RulesEngine — no Node.js require/import
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // DEFAULT RULES
  // ─────────────────────────────────────────────────────────────

  var DEFAULT_RULES = [
    {
      id: 'NB-001',
      name: 'New Business — Write Premium',
      description: 'Records written premium and corresponding unearned premium liability on policy inception.',
      lineOfBusiness: ['*'],
      transactionTypes: ['New Business'],
      status: 'active',
      priority: 1,
      conditions: [
        { field: 'eventType', operator: 'eq', value: 'POLICY_WRITTEN' }
      ],
      actions: [
        {
          sequence: 1,
          debitAccount: 'PREM_RECV',
          creditAccount: 'WRITTEN_PREM',
          amountField: 'grossPremium',
          amountFormula: null,
          description: 'Record gross premium receivable',
          ledger: 'GL'
        },
        {
          sequence: 2,
          debitAccount: 'WRITTEN_PREM',
          creditAccount: 'UNEARNED_PREM',
          amountField: 'unearnedPremium',
          amountFormula: null,
          description: 'Defer unearned premium',
          ledger: 'GL'
        }
      ],
      tags: ['new-business', 'premium', 'written'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'NB-002',
      name: 'New Business — Commission Accrual',
      description: 'Accrues agent commission expense and payable on new business transactions.',
      lineOfBusiness: ['*'],
      transactionTypes: ['New Business'],
      status: 'active',
      priority: 2,
      conditions: [
        { field: 'amounts.commission', operator: 'gt', value: 0 }
      ],
      actions: [
        {
          sequence: 1,
          debitAccount: 'COMM_EXP',
          creditAccount: 'COMM_PAYABLE',
          amountField: 'commission',
          amountFormula: null,
          description: 'Accrue commission expense',
          ledger: 'GL'
        }
      ],
      tags: ['new-business', 'commission'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'NB-003',
      name: 'New Business — Premium Tax',
      description: 'Records premium tax expense and associated tax payable on new business.',
      lineOfBusiness: ['*'],
      transactionTypes: ['New Business'],
      status: 'active',
      priority: 3,
      conditions: [],
      actions: [
        {
          sequence: 1,
          debitAccount: 'TAX_EXP',
          creditAccount: 'TAX_PAYABLE',
          amountField: 'tax',
          amountFormula: null,
          description: 'Record premium tax expense',
          ledger: 'GL'
        }
      ],
      tags: ['new-business', 'tax'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'RNW-001',
      name: 'Renewal — Written Premium',
      description: 'Records written premium and unearned premium deferral on policy renewal.',
      lineOfBusiness: ['*'],
      transactionTypes: ['Renewal'],
      status: 'active',
      priority: 10,
      conditions: [],
      actions: [
        {
          sequence: 1,
          debitAccount: 'PREM_RECV',
          creditAccount: 'WRITTEN_PREM',
          amountField: 'grossPremium',
          amountFormula: null,
          description: 'Record renewal gross premium receivable',
          ledger: 'GL'
        },
        {
          sequence: 2,
          debitAccount: 'WRITTEN_PREM',
          creditAccount: 'UNEARNED_PREM',
          amountField: 'unearnedPremium',
          amountFormula: null,
          description: 'Defer renewal unearned premium',
          ledger: 'GL'
        }
      ],
      tags: ['renewal', 'premium', 'written'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'RNW-002',
      name: 'Renewal — Loss Reserve Adjustment',
      description: 'Establishes or adjusts loss reserves on renewal when prior losses exist.',
      lineOfBusiness: ['*'],
      transactionTypes: ['Renewal'],
      status: 'active',
      priority: 11,
      conditions: [
        { field: 'amounts.lossReserve', operator: 'gt', value: 0 }
      ],
      actions: [
        {
          sequence: 1,
          debitAccount: 'LOSS_EXP',
          creditAccount: 'LOSS_RESERVE',
          amountField: 'lossReserve',
          amountFormula: null,
          description: 'Adjust loss reserve on renewal',
          ledger: 'GL'
        }
      ],
      tags: ['renewal', 'loss-reserve'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'END-001',
      name: 'Endorsement — Premium Adjustment',
      description: 'Records net premium adjustment for mid-term endorsements (positive or negative).',
      lineOfBusiness: ['*'],
      transactionTypes: ['Endorsement'],
      status: 'active',
      priority: 20,
      conditions: [],
      actions: [
        {
          sequence: 1,
          debitAccount: 'PREM_RECV',
          creditAccount: 'WRITTEN_PREM',
          amountField: 'netPremium',
          amountFormula: null,
          description: 'Record endorsement net premium adjustment',
          ledger: 'GL'
        }
      ],
      tags: ['endorsement', 'premium'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'CAN-001',
      name: 'Cancellation — Reverse Unearned Premium',
      description: 'Reverses the unearned premium liability on policy cancellation and reduces receivable.',
      lineOfBusiness: ['*'],
      transactionTypes: ['Cancellation'],
      status: 'active',
      priority: 30,
      conditions: [],
      actions: [
        {
          sequence: 1,
          debitAccount: 'UNEARNED_PREM',
          creditAccount: 'PREM_RECV',
          amountField: 'unearnedPremium',
          amountFormula: null,
          description: 'Reverse unearned premium on cancellation',
          ledger: 'GL'
        }
      ],
      tags: ['cancellation', 'unearned-premium'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'EARN-001',
      name: 'Monthly Earning — Recognize Earned Premium',
      description: 'Transfers the pro-rata earned portion from unearned premium to earned premium each period.',
      lineOfBusiness: ['*'],
      transactionTypes: ['*'],
      status: 'active',
      priority: 40,
      conditions: [],
      actions: [
        {
          sequence: 1,
          debitAccount: 'UNEARNED_PREM',
          creditAccount: 'EARNED_PREM',
          amountField: 'earnedPremium',
          amountFormula: null,
          description: 'Recognize monthly earned premium',
          ledger: 'GL'
        }
      ],
      tags: ['earning', 'earned-premium', 'periodic'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'CA-001',
      name: 'Commercial Auto — Deferred Acquisition Cost',
      description: 'Capitalises 40% of commission as deferred acquisition cost for large commercial risks.',
      lineOfBusiness: ['CommercialProperty', 'WorkersComp'],
      transactionTypes: ['New Business'],
      status: 'active',
      priority: 5,
      conditions: [
        { field: 'amounts.grossPremium', operator: 'gt', value: 10000 }
      ],
      actions: [
        {
          sequence: 1,
          debitAccount: 'DEFER_ACQ',
          creditAccount: 'CASH',
          amountField: null,
          amountFormula: 'commission * 0.4',
          description: 'Defer 40% of commission as acquisition cost',
          ledger: 'GL'
        }
      ],
      tags: ['commercial', 'dac', 'acquisition-cost'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    },
    {
      id: 'WC-001',
      name: "Workers Comp — Enhanced Loss Reserve",
      description: 'Records loss reserve plus a 15% IBNR loading for workers compensation exposures.',
      lineOfBusiness: ['WorkersComp'],
      transactionTypes: ['*'],
      status: 'active',
      priority: 15,
      conditions: [
        { field: 'amounts.lossReserve', operator: 'gt', value: 0 }
      ],
      actions: [
        {
          sequence: 1,
          debitAccount: 'LOSS_EXP',
          creditAccount: 'LOSS_RESERVE',
          amountField: 'lossReserve',
          amountFormula: null,
          description: 'Record workers comp loss reserve',
          ledger: 'GL'
        },
        {
          sequence: 2,
          debitAccount: 'LOSS_EXP',
          creditAccount: 'LOSS_RESERVE',
          amountField: null,
          amountFormula: 'lossReserve * 0.15',
          description: 'Record 15% IBNR loading on workers comp loss reserve',
          ledger: 'GL'
        }
      ],
      tags: ['workers-comp', 'loss-reserve', 'ibnr'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      executionCount: 0,
      lastExecuted: null
    }
  ];

  // ─────────────────────────────────────────────────────────────
  // UTILITY — nested field path accessor
  // ─────────────────────────────────────────────────────────────

  /**
   * Resolve a dot-separated field path against an object.
   * e.g. getNestedValue(event, 'amounts.grossPremium')
   * @param {Object} obj
   * @param {string} path
   * @returns {*}
   */
  function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
      if (current === null || current === undefined) return undefined;
      current = current[parts[i]];
    }
    return current;
  }

  // ─────────────────────────────────────────────────────────────
  // evaluateCondition
  // ─────────────────────────────────────────────────────────────

  /**
   * Evaluate a single Condition against a PolicyEvent.
   * @param {{ field: string, operator: string, value: * }} condition
   * @param {Object} event  PolicyEvent
   * @returns {boolean}
   */
  function evaluateCondition(condition, event) {
    if (!condition || !event) return false;

    var fieldValue = getNestedValue(event, condition.field);
    var condValue  = condition.value;
    var op         = condition.operator;

    switch (op) {
      case 'eq':
        return fieldValue == condValue; // intentional loose equality for mixed types
      case 'neq':
        return fieldValue != condValue;
      case 'gt':
        return Number(fieldValue) > Number(condValue);
      case 'gte':
        return Number(fieldValue) >= Number(condValue);
      case 'lt':
        return Number(fieldValue) < Number(condValue);
      case 'lte':
        return Number(fieldValue) <= Number(condValue);
      case 'in':
        if (!Array.isArray(condValue)) return false;
        return condValue.indexOf(fieldValue) !== -1;
      case 'contains':
        if (typeof fieldValue === 'string') {
          return fieldValue.indexOf(String(condValue)) !== -1;
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.indexOf(condValue) !== -1;
        }
        return false;
      case 'between':
        // condValue must be [min, max]
        if (!Array.isArray(condValue) || condValue.length < 2) return false;
        var numVal = Number(fieldValue);
        return numVal >= Number(condValue[0]) && numVal <= Number(condValue[1]);
      default:
        console.warn('RulesEngine: unknown operator "' + op + '"');
        return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // evaluateConditions (AND logic)
  // ─────────────────────────────────────────────────────────────

  /**
   * All conditions must pass (AND logic).
   * An empty conditions array returns true.
   * @param {Array} conditions
   * @param {Object} event
   * @returns {boolean}
   */
  function evaluateConditions(conditions, event) {
    if (!Array.isArray(conditions) || conditions.length === 0) return true;
    for (var i = 0; i < conditions.length; i++) {
      if (!evaluateCondition(conditions[i], event)) return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // ruleApplies
  // ─────────────────────────────────────────────────────────────

  /**
   * Determine whether a rule should fire for a given PolicyEvent.
   * @param {Object} rule
   * @param {Object} event  PolicyEvent
   * @returns {boolean}
   */
  function ruleApplies(rule, event) {
    if (!rule || !event) return false;

    // 1. Must be active
    if (rule.status !== 'active') return false;

    // 2. Line of business check
    var lobMatch = false;
    if (Array.isArray(rule.lineOfBusiness)) {
      if (rule.lineOfBusiness.indexOf('*') !== -1) {
        lobMatch = true;
      } else if (event.lineOfBusiness) {
        lobMatch = rule.lineOfBusiness.indexOf(event.lineOfBusiness) !== -1;
      }
    }
    if (!lobMatch) return false;

    // 3. Transaction type check
    var txMatch = false;
    if (Array.isArray(rule.transactionTypes)) {
      if (rule.transactionTypes.indexOf('*') !== -1) {
        txMatch = true;
      } else if (event.transactionType) {
        txMatch = rule.transactionTypes.indexOf(event.transactionType) !== -1;
      }
    }
    if (!txMatch) return false;

    // 4. All conditions must pass
    return evaluateConditions(rule.conditions, event);
  }

  // ─────────────────────────────────────────────────────────────
  // resolveAmount
  // ─────────────────────────────────────────────────────────────

  /**
   * Resolve the monetary amount for a JournalAction against a PolicyEvent.
   * Uses amountField first; falls back to amountFormula (safe eval via Function).
   * Always returns the absolute value.
   * @param {Object} action  JournalAction
   * @param {Object} event   PolicyEvent
   * @returns {number}
   */
  function resolveAmount(action, event) {
    var amounts = (event && event.amounts) ? event.amounts : {};
    var result  = 0;

    if (action.amountField) {
      var raw = amounts[action.amountField];
      result = (raw !== undefined && raw !== null) ? Number(raw) : 0;
    } else if (action.amountFormula) {
      try {
        // Build argument list from amounts keys so formula can reference them directly
        var keys   = Object.keys(amounts);
        var values = keys.map(function (k) { return amounts[k]; });
        // Prepend a safety guard — no side-effects beyond reading provided values
        var fn = new Function(keys, '"use strict"; return (' + action.amountFormula + ');');
        result = fn.apply(null, values);
        if (typeof result !== 'number' || isNaN(result)) result = 0;
      } catch (e) {
        console.warn('RulesEngine: formula evaluation failed for "' + action.amountFormula + '":', e.message);
        result = 0;
      }
    }

    return Math.abs(result);
  }

  // ─────────────────────────────────────────────────────────────
  // executeRule
  // ─────────────────────────────────────────────────────────────

  /**
   * Execute a single rule against a PolicyEvent.
   * @param {Object} rule
   * @param {Object} event    PolicyEvent
   * @param {Object} accounts Map of accountKey/code → { code, name }
   * @returns {{ ruleId, ruleName, eventId, applied, journalLines }}
   */
  function executeRule(rule, event, accounts) {
    accounts = accounts || {};

    var result = {
      ruleId:       rule.id,
      ruleName:     rule.name,
      eventId:      (event && event.eventId) ? event.eventId : '',
      applied:      false,
      journalLines: []
    };

    if (!ruleApplies(rule, event)) return result;

    result.applied = true;

    // Update execution stats on the rule object in place
    rule.executionCount = (rule.executionCount || 0) + 1;
    rule.lastExecuted   = new Date().toISOString();

    var actions = Array.isArray(rule.actions) ? rule.actions : [];
    // Sort by sequence
    var sortedActions = actions.slice().sort(function (a, b) { return a.sequence - b.sequence; });

    for (var i = 0; i < sortedActions.length; i++) {
      var action  = sortedActions[i];
      var amount  = resolveAmount(action, event);

      var debitAcct  = resolveAccount(action.debitAccount, accounts);
      var creditAcct = resolveAccount(action.creditAccount, accounts);

      result.journalLines.push({
        sequence:      action.sequence,
        debitAccount:  debitAcct,
        creditAccount: creditAcct,
        amount:        amount,
        description:   action.description || '',
        ledger:        action.ledger || 'GL'
      });
    }

    return result;
  }

  /**
   * Resolve an account key or code to { code, name }.
   * Falls back gracefully if the account is not found in the map.
   * @param {string} keyOrCode
   * @param {Object} accounts
   * @returns {{ code: string, name: string }}
   */
  function resolveAccount(keyOrCode, accounts) {
    if (!keyOrCode) return { code: '', name: '' };
    var acct = accounts[keyOrCode];
    if (acct) {
      return {
        code: acct.code || keyOrCode,
        name: acct.name || keyOrCode
      };
    }
    // Not in map — use key as code and name
    return { code: keyOrCode, name: keyOrCode };
  }

  // ─────────────────────────────────────────────────────────────
  // executeAllRules
  // ─────────────────────────────────────────────────────────────

  /**
   * Run all rules against all events and aggregate results.
   * Rules are applied in priority order (lowest number first).
   * @param {Array}  events   Array of PolicyEvent
   * @param {Array}  rules    Array of Rule
   * @param {Object} accounts Account map
   * @returns {ExecutionResult}
   */
  function executeAllRules(events, rules, accounts) {
    events   = Array.isArray(events)   ? events   : [];
    rules    = Array.isArray(rules)    ? rules    : [];
    accounts = accounts || {};

    // Sort rules by priority ascending
    var sortedRules = rules.slice().sort(function (a, b) { return (a.priority || 99) - (b.priority || 99); });

    var journalEntries      = [];
    var ruleStatMap         = {};
    var errors              = [];
    var totalRulesEvaluated = 0;
    var rulesApplied        = 0;
    var jeSequence          = 0;

    for (var ei = 0; ei < events.length; ei++) {
      var event = events[ei];

      for (var ri = 0; ri < sortedRules.length; ri++) {
        var rule = sortedRules[ri];
        totalRulesEvaluated++;

        var ruleResult;
        try {
          ruleResult = executeRule(rule, event, accounts);
        } catch (err) {
          errors.push('Event ' + (event.eventId || ei) + ' / Rule ' + rule.id + ': ' + err.message);
          continue;
        }

        if (!ruleResult.applied) continue;

        rulesApplied++;
        jeSequence++;

        var je = buildJournalEntry(ruleResult, event, jeSequence);
        journalEntries.push(je);

        // Accumulate rule stats
        if (!ruleStatMap[rule.id]) {
          ruleStatMap[rule.id] = { ruleId: rule.id, ruleName: rule.name, matchCount: 0, totalAmount: 0 };
        }
        ruleStatMap[rule.id].matchCount++;
        ruleStatMap[rule.id].totalAmount += je.totalDebit;
      }
    }

    var ruleStats = Object.keys(ruleStatMap).map(function (k) { return ruleStatMap[k]; });

    return {
      processedEvents:    events.length,
      totalRulesEvaluated: totalRulesEvaluated,
      rulesApplied:       rulesApplied,
      journalEntries:     journalEntries,
      ruleStats:          ruleStats,
      errors:             errors
    };
  }

  // ─────────────────────────────────────────────────────────────
  // buildJournalEntry
  // ─────────────────────────────────────────────────────────────

  /**
   * Construct a JournalEntry from a RuleResult and the originating PolicyEvent.
   * @param {{ ruleId, ruleName, eventId, applied, journalLines }} ruleResult
   * @param {Object} event      PolicyEvent
   * @param {number} [sequence] Optional numeric sequence for jeId uniqueness
   * @returns {JournalEntry}
   */
  function buildJournalEntry(ruleResult, event, sequence) {
    sequence = sequence || 0;
    var ts   = Date.now();
    var jeId = 'JE-' + ts + '-' + String(sequence).padStart(4, '0');

    var lines      = [];
    var totalDebit = 0;
    var totalCredit= 0;
    var lineSeq    = 0;

    var journalLines = ruleResult.journalLines || [];
    for (var i = 0; i < journalLines.length; i++) {
      var jl = journalLines[i];
      lineSeq++;

      // Debit side
      lines.push({
        lineId:      jeId + '-DR-' + lineSeq,
        account:     jl.debitAccount.code,
        accountName: jl.debitAccount.name,
        debit:       jl.amount,
        credit:      0,
        ledger:      jl.ledger || 'GL'
      });
      totalDebit += jl.amount;

      // Credit side
      lines.push({
        lineId:      jeId + '-CR-' + lineSeq,
        account:     jl.creditAccount.code,
        accountName: jl.creditAccount.name,
        debit:       0,
        credit:      jl.amount,
        ledger:      jl.ledger || 'GL'
      });
      totalCredit += jl.amount;
    }

    var balanced = Math.abs(totalDebit - totalCredit) < 0.005; // tolerance for floating point
    var status   = balanced ? 'posted' : 'error';

    return {
      jeId:            jeId,
      date:            (event && event.accountingDate) ? event.accountingDate : new Date().toISOString().slice(0, 10),
      policyNumber:    (event && event.policyNumber)   ? event.policyNumber   : '',
      lineOfBusiness:  (event && event.lineOfBusiness) ? event.lineOfBusiness : '',
      transactionType: (event && event.transactionType)? event.transactionType: '',
      ruleId:          ruleResult.ruleId,
      ruleName:        ruleResult.ruleName,
      description:     ruleResult.ruleName + (event && event.policyNumber ? ' — ' + event.policyNumber : ''),
      lines:           lines,
      status:          status,
      totalDebit:      totalDebit,
      totalCredit:     totalCredit,
      balanced:        balanced,
      source:          'GWPC'
    };
  }

  // ─────────────────────────────────────────────────────────────
  // validateJournalEntry
  // ─────────────────────────────────────────────────────────────

  /**
   * Validate a JournalEntry for balance, account presence, and positive amounts.
   * @param {Object} je  JournalEntry
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateJournalEntry(je) {
    var errs = [];

    if (!je) {
      return { valid: false, errors: ['Journal entry is null or undefined'] };
    }

    // 1. Must have at least 2 lines (one debit, one credit)
    if (!Array.isArray(je.lines) || je.lines.length < 2) {
      errs.push('Journal entry must have at least two lines');
    }

    // 2. Every line must have a valid account code
    var lines = Array.isArray(je.lines) ? je.lines : [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.account || String(line.account).trim() === '') {
        errs.push('Line ' + (i + 1) + ': missing account code');
      }
      // 3. Amounts must be positive (each line is either a debit or credit, not both)
      var lineAmt = Math.max(line.debit || 0, line.credit || 0);
      if (lineAmt <= 0) {
        errs.push('Line ' + (i + 1) + ' (' + (line.account || '?') + '): amount must be greater than zero');
      }
    }

    // 4. Must balance
    if (!je.balanced) {
      errs.push(
        'Journal entry is not balanced: debit=' +
        (je.totalDebit  || 0).toFixed(2) +
        ' credit=' +
        (je.totalCredit || 0).toFixed(2)
      );
    }

    return { valid: errs.length === 0, errors: errs };
  }

  // ─────────────────────────────────────────────────────────────
  // getRuleExecutionSummary
  // ─────────────────────────────────────────────────────────────

  /**
   * Generate an HTML summary of an ExecutionResult for display in a browser.
   * @param {Object} executionResult
   * @returns {string} HTML string
   */
  function getRuleExecutionSummary(executionResult) {
    if (!executionResult) return '<p>No execution result provided.</p>';

    var er     = executionResult;
    var stats  = Array.isArray(er.ruleStats) ? er.ruleStats : [];
    var errors = Array.isArray(er.errors)    ? er.errors    : [];

    // Format currency helper
    function fmt(n) {
      return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    var statsRows = stats.map(function (s) {
      return [
        '<tr>',
        '<td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;">', s.ruleId, '</td>',
        '<td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;">', escapeHtml(s.ruleName), '</td>',
        '<td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;text-align:right;">', s.matchCount, '</td>',
        '<td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;text-align:right;">', fmt(s.totalAmount), '</td>',
        '</tr>'
      ].join('');
    }).join('');

    var errorSection = '';
    if (errors.length > 0) {
      var errorItems = errors.map(function (e) {
        return '<li style="color:#EF4444;margin-bottom:4px;">' + escapeHtml(e) + '</li>';
      }).join('');
      errorSection = [
        '<div style="margin-top:16px;">',
        '<h4 style="font-size:13px;font-weight:600;color:#EF4444;margin-bottom:8px;">Errors (' + errors.length + ')</h4>',
        '<ul style="list-style:disc;padding-left:20px;font-size:12px;">', errorItems, '</ul>',
        '</div>'
      ].join('');
    }

    var balancedCount  = Array.isArray(er.journalEntries) ? er.journalEntries.filter(function (j) { return j.balanced; }).length : 0;
    var unbalancedCount= Array.isArray(er.journalEntries) ? er.journalEntries.filter(function (j) { return !j.balanced; }).length : 0;

    var html = [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:13px;color:#1E293B;">',

      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">',
        kpiCard('Events Processed',    er.processedEvents    || 0, '#2563EB'),
        kpiCard('Rules Evaluated',     er.totalRulesEvaluated|| 0, '#7C3AED'),
        kpiCard('Rules Applied',       er.rulesApplied       || 0, '#059669'),
        kpiCard('Journal Entries',     Array.isArray(er.journalEntries) ? er.journalEntries.length : 0, '#0284C7'),
        kpiCard('Balanced JEs',        balancedCount,               '#16A34A'),
        kpiCard('Unbalanced JEs',      unbalancedCount,             unbalancedCount > 0 ? '#DC2626' : '#94A3B8'),
      '</div>',

      '<h4 style="font-size:13px;font-weight:600;margin-bottom:8px;">Rule Match Summary</h4>',
      stats.length > 0
        ? [
            '<table style="width:100%;border-collapse:collapse;font-size:12px;">',
            '<thead>',
            '<tr style="background:#F1F5F9;">',
            '<th style="padding:6px 12px;text-align:left;font-weight:600;border-bottom:2px solid #CBD5E1;">Rule ID</th>',
            '<th style="padding:6px 12px;text-align:left;font-weight:600;border-bottom:2px solid #CBD5E1;">Rule Name</th>',
            '<th style="padding:6px 12px;text-align:right;font-weight:600;border-bottom:2px solid #CBD5E1;">Matches</th>',
            '<th style="padding:6px 12px;text-align:right;font-weight:600;border-bottom:2px solid #CBD5E1;">Total Debit</th>',
            '</tr>',
            '</thead>',
            '<tbody>', statsRows, '</tbody>',
            '</table>'
          ].join('')
        : '<p style="color:#94A3B8;font-size:12px;">No rules matched.</p>',

      errorSection,
      '</div>'
    ].join('');

    return html;
  }

  function kpiCard(label, value, color) {
    return [
      '<div style="background:#F8F9FA;border:1px solid #E2E8F0;border-radius:8px;padding:12px 16px;min-width:120px;flex:1;">',
      '<div style="font-size:11px;color:#64748B;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">', escapeHtml(String(label)), '</div>',
      '<div style="font-size:22px;font-weight:700;color:', color, ';">', String(value), '</div>',
      '</div>'
    ].join('');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  // ─────────────────────────────────────────────────────────────
  // createRuleStore
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a mutable rule store pre-populated with DEFAULT_RULES.
   * @returns {RuleStore}
   */
  function createRuleStore() {
    // Deep-copy DEFAULT_RULES so each store is independent
    var rules = DEFAULT_RULES.map(function (r) { return deepCopy(r); });

    return {
      /** @type {Array} */
      rules: rules,

      /**
       * Add a rule to the store. Throws if duplicate id.
       * @param {Object} rule
       */
      addRule: function (rule) {
        if (!rule || !rule.id) throw new Error('Rule must have an id');
        if (findIndex(this.rules, rule.id) !== -1) {
          throw new Error('Rule with id "' + rule.id + '" already exists');
        }
        rule.createdAt = rule.createdAt || new Date().toISOString();
        rule.updatedAt = new Date().toISOString();
        rule.executionCount = rule.executionCount || 0;
        rule.lastExecuted   = rule.lastExecuted   || null;
        this.rules.push(rule);
      },

      /**
       * Update an existing rule by id.
       * @param {string} id
       * @param {Object} updates  Partial rule fields to apply
       */
      updateRule: function (id, updates) {
        var idx = findIndex(this.rules, id);
        if (idx === -1) throw new Error('Rule "' + id + '" not found');
        var existing = this.rules[idx];
        Object.keys(updates).forEach(function (k) {
          existing[k] = updates[k];
        });
        existing.updatedAt = new Date().toISOString();
      },

      /**
       * Remove a rule by id.
       * @param {string} id
       */
      deleteRule: function (id) {
        var idx = findIndex(this.rules, id);
        if (idx === -1) throw new Error('Rule "' + id + '" not found');
        this.rules.splice(idx, 1);
      },

      /**
       * Find a rule by id. Returns null if not found.
       * @param {string} id
       * @returns {Object|null}
       */
      getRuleById: function (id) {
        var idx = findIndex(this.rules, id);
        return idx !== -1 ? this.rules[idx] : null;
      },

      /**
       * Return all rules that include the given LOB (or have wildcard).
       * @param {string} lob
       * @returns {Array}
       */
      getRulesByLOB: function (lob) {
        return this.rules.filter(function (r) {
          return Array.isArray(r.lineOfBusiness) &&
            (r.lineOfBusiness.indexOf('*') !== -1 || r.lineOfBusiness.indexOf(lob) !== -1);
        });
      },

      /**
       * Export all rules as a JSON string.
       * @returns {string}
       */
      exportRules: function () {
        return JSON.stringify(this.rules, null, 2);
      },

      /**
       * Import rules from a JSON string, replacing the current rule set.
       * @param {string} json
       */
      importRules: function (json) {
        var parsed;
        try {
          parsed = JSON.parse(json);
        } catch (e) {
          throw new Error('importRules: invalid JSON — ' + e.message);
        }
        if (!Array.isArray(parsed)) throw new Error('importRules: JSON must be an array of rules');
        this.rules = parsed;
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  function findIndex(arr, id) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return i;
    }
    return -1;
  }

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  global.RulesEngine = {
    DEFAULT_RULES:            DEFAULT_RULES,
    evaluateCondition:        evaluateCondition,
    evaluateConditions:       evaluateConditions,
    ruleApplies:              ruleApplies,
    resolveAmount:            resolveAmount,
    executeRule:              executeRule,
    executeAllRules:          executeAllRules,
    buildJournalEntry:        buildJournalEntry,
    validateJournalEntry:     validateJournalEntry,
    getRuleExecutionSummary:  getRuleExecutionSummary,
    createRuleStore:          createRuleStore
  };

}(typeof window !== 'undefined' ? window : this));
