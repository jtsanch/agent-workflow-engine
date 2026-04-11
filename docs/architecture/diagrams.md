# Architecture Diagrams

This document complements [overview.md](/Users/travis/projects/agent-platform/docs/architecture/overview.md) with Mermaid diagrams for two different levels of abstraction:

- high-level infrastructure topology
- system design and execution-layer topology

The diagrams reflect the current repository structure and the intended AWS deployment model described in the existing architecture docs.

## Infrastructure High Level

```mermaid
flowchart TB
    user[User]

    subgraph edge[Edge Layer]
        cf[CloudFront]
        alb[Application Load Balancer]
    end

    subgraph frontend[Frontend Layer]
        s3[S3 Frontend Bucket]
        web[Web App<br/>apps/web]
    end

    subgraph compute[Compute Layer]
        api[ECS Fargate API Service<br/>apps/api]
        worker[ECS Fargate Worker Service<br/>apps/worker]
    end

    subgraph data[Data Layer]
        rds[(Amazon RDS PostgreSQL)]
    end

    subgraph platform[Platform Services]
        scheduler[EventBridge Scheduler]
        secrets[Secrets Manager / SSM]
        ecr[ECR Repositories]
        iam[IAM Roles]
        vpc[VPC / Network]
    end

    user --> cf
    cf --> s3
    s3 --> web

    user --> alb
    alb --> api

    api --> rds
    worker --> rds

    scheduler -. scheduled run trigger .-> api
    secrets -. runtime config .-> api
    secrets -. runtime config .-> worker
    ecr -. image source .-> api
    ecr -. image source .-> worker
    iam -. execution permissions .-> api
    iam -. execution permissions .-> worker
    vpc -. network boundary .-> alb
    vpc -. network boundary .-> api
    vpc -. network boundary .-> worker
    vpc -. network boundary .-> rds
```

### Infra Layers

- Edge: CloudFront serves the frontend path and the ALB fronts the API path.
- Frontend: `apps/web` is deployed as a static site to S3 behind CloudFront.
- Compute: `apps/api` and `apps/worker` are separate ECS Fargate services so the control plane and execution plane can scale independently.
- Data: PostgreSQL on RDS is the system of record for jobs, runs, schedules, telemetry, and memory.
- Platform: EventBridge Scheduler is the intended recurring trigger, while secrets, IAM, ECR, and network modules support runtime operations.

## System Design Level

```mermaid
flowchart LR
    subgraph clients[Clients]
        browser[Browser]
        schedule[Scheduler Trigger]
    end

    subgraph ui[Control Plane UI]
        webui[apps/web]
        pages[Jobs / Create Job / Runs]
        forms[Config-Driven Forms + DAG Preview]
    end

    subgraph api[API Control Plane]
        controllers[Controllers]
        services[Services<br/>AgentCatalog / Jobs / Runs / Alerts / Health]
        repos[Repositories]
        dbAdapters[Database Adapters<br/>Postgres or In-Memory]
        compat[Worker Compat Simulation]
    end

    subgraph worker[Worker Data Plane]
        queue[queue-worker.ts]
        runner[job-runner.ts]
        engine[dag-engine.ts]
        planner[planner.ts]
        resolve[input-resolver.ts]
        nodeRunner[node-runner.ts]
        retry[retry-manager.ts]
        memory[memory.ts]
        executor[executor.ts]
        state[execution-state.ts]
    end

    subgraph shared[Shared Packages]
        sdk[packages/agent-sdk]
        domain[packages/shared]
        uiSchema[packages/ui-schema]
        obs[packages/observability]
    end

    subgraph storage[Persistence]
        jobs[(jobs)]
        schedules[(job_schedules)]
        alerts[(job_alert_preferences)]
        runs[(job_runs)]
        steps[(job_run_steps)]
        tools[(tool_invocations)]
        mem[(job_memories)]
        dags[(agent_dags / agent_nodes / agent_edges)]
        nodeExec[(node_executions)]
        feedback[(node_feedback)]
    end

    browser --> webui
    webui --> pages
    webui --> forms

    forms -->|GET /agents| controllers
    pages -->|GET /jobs, GET /runs, GET /alerts| controllers
    forms -->|POST /jobs| controllers
    pages -->|POST /runs| controllers
    pages -->|POST /runs/simulate| compat
    schedule -->|future scheduled invocation| controllers

    controllers --> services
    services --> repos
    repos --> dbAdapters

    dbAdapters --> jobs
    dbAdapters --> schedules
    dbAdapters --> alerts
    dbAdapters --> runs
    dbAdapters --> steps
    dbAdapters --> tools
    dbAdapters --> mem
    dbAdapters --> dags
    dbAdapters --> nodeExec
    dbAdapters --> feedback

    queue -->|claim queued run| runs
    queue --> runner
    runner --> engine
    engine --> planner
    engine --> resolve
    engine --> nodeRunner
    engine --> retry
    engine --> state
    runner --> memory
    nodeRunner --> executor

    sdk --> services
    sdk --> runner
    domain --> webui
    domain --> controllers
    domain --> runner
    uiSchema --> webui
    obs --> controllers
    obs --> queue

    services -->|enqueue run| runs
    services -->|create/read jobs| jobs
    services -->|store schedules| schedules
    services -->|store alerts| alerts

    queue -->|persist final output| runs
    queue -->|persist steps| steps
    queue -->|persist tool telemetry| tools
    queue -->|persist memory| mem
    queue -->|persist node traces| nodeExec
    queue -->|persist evaluator feedback| feedback
```

### System Layers

- Client layer: browser users and future schedule triggers initiate control-plane actions.
- UI layer: `apps/web` renders agent definitions as forms, previews DAGs, and drives job/run actions.
- API layer: controllers, services, repositories, and database adapters own validation, persistence, queueing, and read models.
- Worker layer: the worker owns queue claiming, DAG execution, retry handling, telemetry capture, and memory generation.
- Shared layer: shared packages keep schemas, agent definitions, UI schema contracts, and observability consistent across apps.
- Persistence layer: PostgreSQL stores durable workflow state, DAG metadata, execution traces, and feedback artifacts.

## End-to-End Run Path

1. A user creates a job in `apps/web` from an agent definition and DAG preview.
2. `apps/api` validates the request and stores the job, schedule, and alert configuration.
3. A manual run or future scheduler trigger causes the API to insert a `job_runs` row with status `queued`.
4. `apps/worker` polls PostgreSQL, claims one queued run with `FOR UPDATE SKIP LOCKED`, and marks it `running`.
5. The worker resolves node inputs, executes the DAG, records node telemetry and evaluator feedback, writes memory, and updates the run to `succeeded` or `failed`.
