variable "name" { type = string }
output "vpc_id" { value = "${var.name}-vpc" }

