variable "name" { type = string }
output "secret_namespace" { value = "/${var.name}" }

