variable "name" { type = string }
output "dns_name" { value = "${var.name}.elb.amazonaws.com" }
