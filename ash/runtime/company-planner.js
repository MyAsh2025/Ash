function buildCompanyPlanner({
  executiveRuntime,
  domainPlanner,
  developmentDomain,
  businessDomain
}) {
  const domains = [];

  function addDomain(name, priority, plannedActions = [], reason = "") {
    domains.push({
      name,
      priority,
      plannedActions,
      active: priority > 0,
      reason
    });
  }

  if (executiveRuntime?.domain === "repository") {
    addDomain(
      "repository",
      100,
      domainPlanner?.plannedActions || [],
      "Repository review is the Executive priority."
    );

    addDomain(
      "development",
      80,
      developmentDomain?.plannedActions || [],
      "Development supports repository review and verification."
    );
  }

  if (businessDomain?.active) {
    addDomain(
      "business",
      90,
      businessDomain?.plannedActions || [],
      "Business domain selected by Executive Runtime."
    );
  } else {
    addDomain(
      "business",
      20,
      [],
      "Business domain is available but not currently prioritized."
    );
  }

  const sortedDomains = domains.sort((a, b) => b.priority - a.priority);

  return {
    mode: "company-planner-runtime",
    version: "ash-local-runtime-v0.1",
    objective: executiveRuntime?.objective || null,
    primaryDomain: sortedDomains[0]?.name || null,
    domains: sortedDomains,
    plannedActions: [
      ...new Set(sortedDomains.flatMap((domain) => domain.plannedActions || []))
    ],
    planReady: sortedDomains.length > 0,
    plannedAt: new Date().toISOString()
  };
}

module.exports = {
  buildCompanyPlanner
};
