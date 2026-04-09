terraform {
  required_version = ">= 1.6.0"
}

module "network" {
  source = "../../modules/network"
  name   = "personal-agent-os-dev"
}

module "alb" {
  source = "../../modules/alb"
  name   = "personal-agent-os-dev"
}

module "iam" {
  source = "../../modules/iam"
  name   = "personal-agent-os-dev"
}

module "ecr" {
  source = "../../modules/ecr"
  name   = "personal-agent-os-dev"
}

module "rds_postgres" {
  source = "../../modules/rds-postgres"
  name   = "personal-agent-os-dev"
}

module "secrets" {
  source = "../../modules/secrets"
  name   = "personal-agent-os-dev"
}

module "s3_frontend" {
  source = "../../modules/s3-frontend"
  name   = "personal-agent-os-dev"
}

module "cloudfront" {
  source = "../../modules/cloudfront"
  name   = "personal-agent-os-dev"
}

module "api_service" {
  source = "../../modules/ecs-service"
  name   = "personal-agent-os-api-dev"
}

module "worker_service" {
  source = "../../modules/ecs-service"
  name   = "personal-agent-os-worker-dev"
}

module "scheduler" {
  source = "../../modules/eventbridge-scheduler"
  name   = "personal-agent-os-dev"
}

