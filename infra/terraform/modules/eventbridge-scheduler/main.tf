variable "name" { type = string }
output "schedule_group" { value = "${var.name}-schedules" }

