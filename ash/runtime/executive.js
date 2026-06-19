function rankPriorities(observation, policy, repository) {
  const priorities = [];
  const domain = observation?.domain || "general";
  const importance = observation?.importance || { level: "low", score: 0 };
  const rules = policy?.rules || {};

  if (rules.cashflowReview) {
    priorities.push({
      domain: "finance",
      priority: 100,
      reason: "cashflow review required"
    });
  }

  if (repository && repository.clean === false) {
    priorities.push({
      domain: "development",
      priority: 80,
      reason: "repository has pending changes"
    });
  }

  if (rules.executiveReview) {
    priorities.push({
      domain: "executive",
      priority: 70,
      reason: "executive review required by policy"
    });
  }

  if (rules.marketReview) {
    priorities.push({
      domain: "market",
      priority: 60,
      reason: "market review required by policy"
    });
  }

  if (domain === "architecture" || rules.ashCoreSave) {
    priorities.push({
      domain: "architecture",
      priority: 55,
      reason: "architecture or Ash_Core save required"
    });
  }

  if (importance.level === "critical") {
    priorities.push({
      domain,
      priority: 50,
      reason: "critical observation importance"
    });
  }

  return priorities
    .sort((a, b) => b.priority - a.priority)
    .filter((item, index, arr) => {
      return arr.findIndex((x) => x.domain === item.domain) === index;
    });
}

function makeExecutiveDecision({ observation, policy, repository }) {
  const priorities = rankPriorities(observation, policy, repository);

  return {
    mode: "executive-runtime",
    version: "ash-local-runtime-v0.1",
    priorities,
    topPriority: priorities[0] || {
      domain: "general",
      priority: 0,
      reason: "no priority detected"
    },
    recommendation: priorities.length > 0
      ? `Focus first on ${priorities[0].domain}: ${priorities[0].reason}`
      : "No executive action required",
    decidedAt: new Date().toISOString()
  };
}

module.exports = { makeExecutiveDecision };
