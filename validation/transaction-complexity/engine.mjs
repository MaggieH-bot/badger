const ACTIONS = {
  confirm_upstream_settlement: {
    agent: 'Confirm the upstream transaction actually settled.',
    consumer: 'Confirm with your agent or settlement team that the transaction your move depends on actually settled.',
  },
  confirm_downstream_settlement_on_track: {
    agent: 'Confirm the dependent transaction is still on track for its planned settlement.',
    consumer: 'Confirm with your agent or settlement team that your planned settlement is still on track.',
  },
  confirm_funds_path: {
    agent: 'Confirm the proceeds/assignment-of-funds path with the applicable settlement teams.',
    consumer: 'Ask your settlement team to confirm how proceeds will move into the dependent purchase.',
  },
  review_downstream_settlement_date: {
    agent: 'Review whether the downstream settlement date needs to move.',
    consumer: 'Ask your agent whether the settlement date may need to change.',
  },
  check_delay_window: {
    agent: 'Compare the upstream delay against the documented downstream delay window.',
    consumer: 'Ask your agent to compare the delay with the timing allowed by your contract.',
  },
  escalate_written_extension_review: {
    agent: 'Escalate for broker/attorney review because the modeled delay exceeds the documented window; do not change the date automatically.',
    consumer: 'Ask your agent or attorney what written agreement, if any, is needed because the delay may exceed the timing allowed by your contract.',
  },
  coordinate_settlement_parties: {
    agent: 'Coordinate lender/title/settlement participants affected by the timing change.',
    consumer: 'Confirm that your agent, lender, and settlement team are coordinating on the timing change.',
  },
  notify_transaction_team: {
    agent: 'Notify the responsible transaction team that a dependency changed and needs review.',
    consumer: 'Make sure your agent or transaction team knows the dependency changed.',
  },
  stop_assuming_downstream_settlement: {
    agent: 'Stop treating the dependent settlement as assured until the contract/status review is complete.',
    consumer: 'Do not assume the dependent closing is still certain until your agent reviews the change.',
  },
  review_contract_status_with_broker_or_attorney: {
    agent: 'Review the downstream contract status, notice requirements, and available options with the broker/attorney; the system must not make the legal determination.',
    consumer: 'Ask your agent, broker, or attorney what the upstream failure means for your contract and any required notice.',
  },
  document_source_event: {
    agent: 'Capture the source evidence for the upstream failure before taking downstream action.',
    consumer: 'Ask your agent what documentation confirms the upstream transaction changed or failed.',
  },
  confirm_upstream_contingency_cleared: {
    agent: 'Confirm the upstream buyer contingency cleared before relying on the next transaction in the chain.',
    consumer: 'Confirm with your agent that the earlier contingency in the chain actually cleared.',
  },
  reconfirm_mid_transaction_readiness: {
    agent: 'Reconfirm the middle transaction remains positioned to settle.',
    consumer: 'Ask your agent to reconfirm that the sale your purchase depends on is still positioned to settle.',
  },
  review_mid_transaction_risk: {
    agent: 'Review how the upstream delay changes confidence in the middle transaction.',
    consumer: 'Ask your agent how the delay affects the sale your purchase depends on.',
  },
  review_downstream_timing_buffer: {
    agent: 'Review whether the downstream timing buffer still exists after the upstream delay.',
    consumer: 'Ask your agent whether there is still enough time between the linked transactions.',
  },
  review_financing_fallback: {
    agent: 'Review any financing fallback that was intended to bridge the timing gap; confirm with the lender rather than assuming.',
    consumer: 'Ask your lender and agent whether a financing fallback is needed because the timing changed.',
  },
  review_mid_transaction_viability: {
    agent: 'Review whether the middle transaction remains viable after the upstream failure.',
    consumer: 'Ask your agent whether the sale your purchase depends on is still viable after the earlier transaction failed.',
  },
  review_downstream_financing_or_contingency_strategy: {
    agent: 'Review downstream financing/contingency strategy; do not infer a legal right or financing approval.',
    consumer: 'Ask your agent and lender what options remain for the downstream purchase; do not assume financing or contract rights.',
  },
};

const FORBIDDEN_AUTOMATIONS = new Set([
  'auto_void_contract',
  'auto_change_settlement_date',
  'send_client_notice',
  'legal_conclusion',
]);

function actionsForEdge(edge, status, delayDays = 0) {
  const actions = [];
  if (edge.relation === 'settlement_dependency') {
    if (status === 'on_time') {
      actions.push('confirm_upstream_settlement', 'confirm_downstream_settlement_on_track');
      if (edge.acceptsAssignmentOfFunds) actions.push('confirm_funds_path');
    } else if (status === 'delayed') {
      actions.push(
        'review_downstream_settlement_date',
        'coordinate_settlement_parties',
        'notify_transaction_team',
      );
      if (typeof edge.maxDelayDays === 'number') {
        actions.push('check_delay_window');
        if (delayDays > edge.maxDelayDays) actions.push('escalate_written_extension_review');
      }
      if (edge.acceptsAssignmentOfFunds) actions.push('confirm_funds_path');
      if (edge.financingFallback) actions.push('review_financing_fallback');
    } else if (status === 'failed') {
      actions.push(
        'stop_assuming_downstream_settlement',
        'review_contract_status_with_broker_or_attorney',
        'notify_transaction_team',
        'document_source_event',
      );
      if (edge.financingFallback) actions.push('review_financing_fallback');
    }
  } else if (edge.relation === 'contingency_dependency') {
    if (status === 'on_time') {
      actions.push('confirm_upstream_contingency_cleared', 'reconfirm_mid_transaction_readiness');
    } else if (status === 'delayed') {
      actions.push(
        'review_mid_transaction_risk',
        'review_downstream_timing_buffer',
        'notify_transaction_team',
      );
      if (edge.financingFallback) actions.push('review_financing_fallback');
    } else if (status === 'failed') {
      actions.push(
        'review_mid_transaction_viability',
        'review_downstream_financing_or_contingency_strategy',
        'notify_transaction_team',
      );
    }
  } else {
    throw new Error(`Unknown relation: ${edge.relation}`);
  }
  return actions;
}

export function evaluateImpact(testCase, event) {
  const nodeById = new Map(testCase.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  for (const edge of testCase.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }

  if (!nodeById.has(event.transactionId)) {
    throw new Error(`Unknown event transaction: ${event.transactionId}`);
  }

  const queue = [{ nodeId: event.transactionId, status: event.status, depth: 0 }];
  const visitedEdgeIds = new Set();
  const impacted = [];

  while (queue.length) {
    const current = queue.shift();
    for (const edge of outgoing.get(current.nodeId) ?? []) {
      if (visitedEdgeIds.has(edge.id)) continue;
      visitedEdgeIds.add(edge.id);

      const actionIds = actionsForEdge(edge, current.status, event.delayDays ?? 0);
      impacted.push({
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        relation: edge.relation,
        source: edge.source,
        depth: current.depth + 1,
        actionIds,
      });

      queue.push({ nodeId: edge.to, status: current.status, depth: current.depth + 1 });
    }
  }

  const actionIds = [...new Set(impacted.flatMap((item) => item.actionIds))];
  const affectedNodeIds = [...new Set(impacted.map((item) => item.to))];

  return {
    caseId: testCase.id,
    event,
    affectedNodeIds,
    actionIds,
    impacts: impacted,
  };
}

export function renderAudience(result, audience = 'agent') {
  if (!['agent', 'consumer'].includes(audience)) throw new Error(`Unknown audience: ${audience}`);
  return result.actionIds.map((id) => ({ id, text: ACTIONS[id][audience] }));
}

export function safetyCheck(result) {
  const forbidden = result.actionIds.filter((id) => FORBIDDEN_AUTOMATIONS.has(id));
  return { ok: forbidden.length === 0, forbidden };
}
