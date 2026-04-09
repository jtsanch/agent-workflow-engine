variable "name" { type = string }
output "endpoint" { value = "${var.name}.cluster.local" }

