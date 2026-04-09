variable "name" { type = string }
output "repository_urls" { value = { api = "${var.name}/api", worker = "${var.name}/worker" } }

