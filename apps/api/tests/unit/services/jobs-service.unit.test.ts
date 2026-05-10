import { describe, expect, it, vi } from "vitest";
import type { AlertPreferenceRepository, JobRepository, JobScheduleRepository } from "../../../src/repositories/interfaces.js";
import type { AgentDefinition, CreateJobInput, UserContext } from "@personal-agent-os/shared";
import { JobsService } from "../../../src/services/jobs-service.js";
import type { AgentCatalogService } from "../../../src/services/agent-catalog.js";

const userContext: UserContext = {
  userId: "user_test",
  email: "test@example.com"
};

const createJobInput: CreateJobInput = {
  agentDefinitionKey: "grocery-planner",
  name: "Daily Grocery",
  scheduleExpression: "cron(0 9 ? * SUN *)",
  timezone: "America/Los_Angeles",
  dagId: "dag_grocery_planner",
  inputs: {
    preferences: {
      days: 7,
      servings: 2,
      budgetUsd: 100,
      dietaryTags: ["balanced"]
    }
  },
  alertPreferences: [
    {
      channel: "email",
      destination: "test@example.com",
      onSuccess: true,
      onFailure: true
    }
  ]
};

describe("JobsService", () => {
  function createRepositories(): {
    jobRepository: JobRepository;
    jobScheduleRepository: JobScheduleRepository;
    alertPreferenceRepository: AlertPreferenceRepository;
  } {
    return {
      jobRepository: {
        listByUser: vi.fn(),
        findById: vi.fn(),
        create: vi.fn()
      },
      jobScheduleRepository: {
        findByJobId: vi.fn(),
        create: vi.fn()
      },
      alertPreferenceRepository: {
        listByJobId: vi.fn(),
        createMany: vi.fn()
      }
    };
  }

  function createAgentCatalogService(): AgentCatalogService {
    const agentDefinition = {
      key: "grocery-planner",
      dag: {
        id: "dag_grocery_planner"
      }
    } as unknown as AgentDefinition;

    return {
      list: vi.fn(() => [agentDefinition]),
      getByKey: vi.fn((key: string) => (key === agentDefinition.key ? agentDefinition : null)),
      getByDagId: vi.fn((dagId: string) => (dagId === agentDefinition.dag.id ? agentDefinition : null))
    } as unknown as AgentCatalogService;
  }

  it("creates a job with schedule and alert preferences", async () => {
    const { jobRepository, jobScheduleRepository, alertPreferenceRepository } = createRepositories();
    const agentCatalogService = createAgentCatalogService();
    vi.mocked(jobRepository.create).mockImplementation(async (job) => job);
    vi.mocked(jobScheduleRepository.create).mockImplementation(async (schedule) => schedule);
    vi.mocked(alertPreferenceRepository.createMany).mockImplementation(async (preferences) => preferences);
    const jobsService = new JobsService(
      jobRepository,
      jobScheduleRepository,
      alertPreferenceRepository,
      agentCatalogService
    );

    const job = await jobsService.createJob(createJobInput, userContext);
    vi.mocked(jobRepository.listByUser).mockResolvedValue([job]);
    vi.mocked(jobScheduleRepository.findByJobId).mockResolvedValue({
      id: "schedule_1",
      jobId: job.id,
      scheduleExpression: createJobInput.scheduleExpression,
      timezone: createJobInput.timezone,
      enabled: true,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
    vi.mocked(alertPreferenceRepository.listByJobId).mockResolvedValue([
      {
        id: "alert_1",
        jobId: job.id,
        channel: "email",
        destination: "test@example.com",
        onSuccess: true,
        onFailure: true
      }
    ]);
    const jobs = await jobsService.listJobs(userContext);

    expect(job.agentDefinitionKey).toBe("grocery-planner");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.schedule?.scheduleExpression).toBe(createJobInput.scheduleExpression);
    expect(jobs[0]?.alertPreferences).toHaveLength(1);
    expect(jobs[0]?.inputs.preferences).toMatchObject({ days: 7, servings: 2, budgetUsd: 100 });
    expect(jobRepository.create).toHaveBeenCalledOnce();
    expect(jobScheduleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        scheduleExpression: createJobInput.scheduleExpression
      })
    );
    expect(alertPreferenceRepository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ jobId: job.id })])
    );
  });

  it("throws when the agent definition key is unknown", async () => {
    const { jobRepository, jobScheduleRepository, alertPreferenceRepository } = createRepositories();
    const agentCatalogService = createAgentCatalogService();
    const jobsService = new JobsService(
      jobRepository,
      jobScheduleRepository,
      alertPreferenceRepository,
      agentCatalogService
    );

    await expect(
      jobsService.createJob(
        {
          ...createJobInput,
          agentDefinitionKey: "missing-agent"
        },
        userContext
      )
    ).rejects.toMatchObject({
      code: "agent_not_found",
      statusCode: 404
    });
  });
});
