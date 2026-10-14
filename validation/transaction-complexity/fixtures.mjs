export const CASES = [
  {
    id: 'single-hop-settlement-dependency',
    provenance: 'Anonymized from a ratified Northern Virginia transaction. Party names, property addresses, and identifying details intentionally omitted.',
    nodes: [
      { id: 'upstream-sale', label: 'Buyer upstream sale' },
      { id: 'dependent-purchase', label: 'Dependent purchase' },
    ],
    edges: [
      {
        id: 'sale-to-purchase',
        from: 'upstream-sale',
        to: 'dependent-purchase',
        relation: 'settlement_dependency',
        maxDelayDays: 5,
        acceptsAssignmentOfFunds: true,
        reviewOwners: ['agent', 'transaction_coordinator', 'settlement_agent'],
        requiredInputs: [
          { key: 'upstreamSettlementStatus', known: true },
          { key: 'documentedDelayWindow', known: true },
          { key: 'assignmentOfFundsAllowed', known: true },
        ],
        source: { type: 'contract_addendum', confidence: 'verified' },
      },
    ],
    scenarios: [
      {
        id: 'settles-on-time',
        event: { transactionId: 'upstream-sale', status: 'on_time', delayDays: 0 },
        expect: {
          affectedNodeIds: ['dependent-purchase'],
          requiredRoles: ['agent', 'transaction_coordinator', 'settlement_agent'],
          requiredMissingInputs: [],
          requiredActionIds: [
            'confirm_upstream_settlement',
            'confirm_downstream_settlement_on_track',
            'confirm_funds_path',
          ],
          forbiddenActionIds: ['auto_void_contract', 'auto_change_settlement_date', 'send_client_notice', 'legal_conclusion'],
        },
      },
      {
        id: 'delayed-within-documented-window',
        event: { transactionId: 'upstream-sale', status: 'delayed', delayDays: 3 },
        expect: {
          affectedNodeIds: ['dependent-purchase'],
          requiredRoles: ['agent', 'transaction_coordinator', 'settlement_agent'],
          requiredMissingInputs: [],
          requiredActionIds: [
            'review_downstream_settlement_date',
            'coordinate_settlement_parties',
            'notify_transaction_team',
            'check_delay_window',
            'confirm_funds_path',
          ],
          forbiddenActionIds: ['escalate_written_extension_review', 'auto_change_settlement_date', 'legal_conclusion'],
        },
      },
      {
        id: 'delay-exceeds-documented-window',
        event: { transactionId: 'upstream-sale', status: 'delayed', delayDays: 6 },
        expect: {
          affectedNodeIds: ['dependent-purchase'],
          requiredRoles: ['agent', 'transaction_coordinator', 'settlement_agent'],
          requiredMissingInputs: [],
          requiredActionIds: [
            'review_downstream_settlement_date',
            'check_delay_window',
            'escalate_written_extension_review',
            'coordinate_settlement_parties',
          ],
          forbiddenActionIds: ['auto_change_settlement_date', 'send_client_notice', 'legal_conclusion'],
        },
      },
      {
        id: 'upstream-contract-fails',
        event: { transactionId: 'upstream-sale', status: 'failed' },
        expect: {
          affectedNodeIds: ['dependent-purchase'],
          requiredRoles: ['agent', 'transaction_coordinator', 'settlement_agent'],
          requiredMissingInputs: [],
          requiredActionIds: [
            'stop_assuming_downstream_settlement',
            'review_contract_status_with_broker_or_attorney',
            'notify_transaction_team',
            'document_source_event',
          ],
          forbiddenActionIds: ['auto_void_contract', 'send_client_notice', 'legal_conclusion'],
        },
      },
    ],
  },
  {
    id: 'two-hop-contingency-chain',
    provenance: 'Anonymized from a real three-transaction chain. Exact client, property, and contract identifiers intentionally omitted.',
    nodes: [
      { id: 'earlier-buyer-contingency', label: 'Earlier buyer contingency' },
      { id: 'client-sale', label: 'Client sale' },
      { id: 'client-purchase', label: 'Client purchase' },
    ],
    edges: [
      {
        id: 'contingency-to-sale',
        from: 'earlier-buyer-contingency',
        to: 'client-sale',
        relation: 'contingency_dependency',
        reviewOwners: ['agent', 'transaction_coordinator'],
        requiredInputs: [
          { key: 'upstreamContingencyStatus', known: true },
          { key: 'middleTransactionContractStatus', known: true },
        ],
        source: { type: 'transaction_communication', confidence: 'verified' },
      },
      {
        id: 'sale-to-purchase',
        from: 'client-sale',
        to: 'client-purchase',
        relation: 'settlement_dependency',
        financingFallback: true,
        reviewOwners: ['agent', 'transaction_coordinator', 'settlement_agent', 'lender'],
        requiredInputs: [
          { key: 'downstreamContractDelayWindow', known: false },
          { key: 'finalFinancingFallbackTerms', known: false },
        ],
        source: { type: 'transaction_communication', confidence: 'verified' },
      },
    ],
    scenarios: [
      {
        id: 'chain-clears-on-time',
        event: { transactionId: 'earlier-buyer-contingency', status: 'on_time', delayDays: 0 },
        expect: {
          affectedNodeIds: ['client-sale', 'client-purchase'],
          requiredRoles: ['agent', 'transaction_coordinator', 'settlement_agent', 'lender'],
          requiredMissingInputs: ['downstreamContractDelayWindow', 'finalFinancingFallbackTerms'],
          requiredActionIds: [
            'confirm_upstream_contingency_cleared',
            'reconfirm_mid_transaction_readiness',
            'confirm_upstream_settlement',
            'confirm_downstream_settlement_on_track',
          ],
          forbiddenActionIds: ['auto_void_contract', 'auto_change_settlement_date', 'legal_conclusion'],
        },
      },
      {
        id: 'earlier-contingency-delayed',
        event: { transactionId: 'earlier-buyer-contingency', status: 'delayed', delayDays: 2 },
        expect: {
          affectedNodeIds: ['client-sale', 'client-purchase'],
          requiredRoles: ['agent', 'transaction_coordinator', 'settlement_agent', 'lender'],
          requiredMissingInputs: ['downstreamContractDelayWindow', 'finalFinancingFallbackTerms'],
          requiredActionIds: [
            'review_mid_transaction_risk',
            'review_downstream_timing_buffer',
            'review_downstream_settlement_date',
            'coordinate_settlement_parties',
            'review_financing_fallback',
            'notify_transaction_team',
          ],
          forbiddenActionIds: ['auto_change_settlement_date', 'send_client_notice', 'legal_conclusion'],
        },
      },
      {
        id: 'earlier-transaction-fails',
        event: { transactionId: 'earlier-buyer-contingency', status: 'failed' },
        expect: {
          affectedNodeIds: ['client-sale', 'client-purchase'],
          requiredRoles: ['agent', 'transaction_coordinator', 'settlement_agent', 'lender'],
          requiredMissingInputs: ['downstreamContractDelayWindow', 'finalFinancingFallbackTerms'],
          requiredActionIds: [
            'review_mid_transaction_viability',
            'review_downstream_financing_or_contingency_strategy',
            'stop_assuming_downstream_settlement',
            'review_contract_status_with_broker_or_attorney',
            'review_financing_fallback',
            'notify_transaction_team',
          ],
          forbiddenActionIds: ['auto_void_contract', 'send_client_notice', 'legal_conclusion'],
        },
      },
    ],
  },
];
