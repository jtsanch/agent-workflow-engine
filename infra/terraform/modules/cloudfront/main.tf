variable "name" { type = string }
output "distribution_domain_name" { value = "${var.name}.cloudfront.net" }

