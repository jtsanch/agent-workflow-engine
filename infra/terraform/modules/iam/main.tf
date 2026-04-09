variable "name" { type = string }
output "task_execution_role" { value = "${var.name}-task-execution" }

