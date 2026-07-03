function buildRepositoryAssessment(repository = {}) {
  const clean = repository.clean !== false;

  return {
    clean,
    commitRequired: !clean,
    pushRequired: false,
    checkpointRequired: !clean,
    coreCheckRequired: !clean,
    ashCoreSyncRequired: false,
    repositoryHealth: clean ? "healthy" : "dirty",
    recommendation: clean
      ? "Repository is synchronized."
      : "Repository requires verification before checkpoint."
  };
}

function buildRepositoryManagerTask({ repository }) {
  const assessment = buildRepositoryAssessment(repository);

  return {
    manager: "repository-manager",
    version: "ash-manager-v0.2",
    domain: "repository",
    active: !assessment.clean,
    priority: assessment.clean ? 20 : 70,
    assessment,
    preferredAgents: [],
    decidedAt: new Date().toISOString()
  };
}

module.exports = {
  buildRepositoryAssessment,
  buildRepositoryManagerTask
};
