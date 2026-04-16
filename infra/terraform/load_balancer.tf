# Cloud Load Balancer for unified entry point
# Replicates nginx.conf routing pattern
# Using Google-provided domain for now (custom domain can be added later)

# Reserve static IP for the load balancer
resource "google_compute_global_address" "lb_ip" {
  name = "ai-governance-lb-ip${local.env_suffix}"
}

# Backend service for ControlNet
resource "google_compute_backend_service" "controlnet_backend" {
  name                  = "controlnet-backend${local.env_suffix}"
  protocol              = "HTTP"
  port_name             = "http"
  enable_cdn            = false
  load_balancing_scheme = "EXTERNAL_MANAGED"
  # Note: timeout_sec not supported for Serverless NEGs
  # Timeout handled by Cloud Run service itself (300s configured there)

  backend {
    group = google_compute_region_network_endpoint_group.controlnet_neg.id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# Backend service for ModelGuard
resource "google_compute_backend_service" "modelguard_backend" {
  name                  = "modelguard-backend${local.env_suffix}"
  protocol              = "HTTP"
  port_name             = "http"
  enable_cdn            = false
  load_balancing_scheme = "EXTERNAL_MANAGED"

  # Note: timeout_sec not supported for Serverless NEGs
  # Timeout handled by Cloud Run service itself (600s configured there)

  backend {
    group = google_compute_region_network_endpoint_group.modelguard_neg.id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# Backend service for ONNX Inference
resource "google_compute_backend_service" "onnx_backend" {
  name                  = "onnx-backend${local.env_suffix}"
  protocol              = "HTTP"
  port_name             = "http"
  enable_cdn            = false
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.onnx_neg.id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# Backend service for Web App
resource "google_compute_backend_service" "web_backend" {
  name                  = "web-backend${local.env_suffix}"
  protocol              = "HTTP"
  port_name             = "http"
  enable_cdn            = true
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.web_neg.id
  }

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 3600
    client_ttl        = 7200
    max_ttl           = 86400
    negative_caching  = true
    serve_while_stale = 86400

    cache_key_policy {
      include_host         = true
      include_protocol     = true
      include_query_string = true
    }
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# Network Endpoint Group for ControlNet (Serverless)
resource "google_compute_region_network_endpoint_group" "controlnet_neg" {
  name                  = "controlnet-neg${local.env_suffix}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.controlnet.name
  }
}

# Network Endpoint Group for Web App (Serverless)
resource "google_compute_region_network_endpoint_group" "web_neg" {
  name                  = "web-neg${local.env_suffix}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.web.name
  }
}

# Network Endpoint Group for ModelGuard (Serverless)
resource "google_compute_region_network_endpoint_group" "modelguard_neg" {
  name                  = "modelguard-neg${local.env_suffix}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.modelguard.name
  }
}

# Network Endpoint Group for ONNX (Serverless)
resource "google_compute_region_network_endpoint_group" "onnx_neg" {
  name                  = "onnx-neg${local.env_suffix}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.onnx.name
  }
}

# URL Map - defines routing rules (nginx equivalent)
resource "google_compute_url_map" "lb_url_map" {
  name            = "ai-governance-lb${local.env_suffix}"
  default_service = google_compute_backend_service.web_backend.id

  # Path-based routing (matches nginx.conf)
  path_matcher {
    name            = "path-matcher"
    default_service = google_compute_backend_service.web_backend.id

    # ModelGuard API routes
    path_rule {
      paths   = ["/modelguard/*"]
      service = google_compute_backend_service.modelguard_backend.id
    }

    # ONNX Inference Service - Available via load balancer
    # ControlNet accesses via load balancer URL for proper routing
    path_rule {
      paths = ["/onnx/*"]
      route_action {
        url_rewrite {
          path_prefix_rewrite = "/"
        }
        weighted_backend_services {
          backend_service = google_compute_backend_service.onnx_backend.id
          weight          = 100
        }
      }
    }

    # ControlNet Gateway API routes
    path_rule {
      paths   = ["/v1/*"]
      service = google_compute_backend_service.controlnet_backend.id
    }

    # ControlNet docs and health
    path_rule {
      paths = [
        "/docs",
        "/docs/*",
        "/redoc",
        "/openapi.json",
        "/healthz",
        "/readyz"
      ]
      service = google_compute_backend_service.controlnet_backend.id
    }

    # Next.js API routes
    path_rule {
      paths   = ["/api/*"]
      service = google_compute_backend_service.web_backend.id
    }
  }

  host_rule {
    hosts        = ["*"]
    path_matcher = "path-matcher"
  }
}

# Managed SSL Certificate for demo.kentron.ai
resource "google_compute_managed_ssl_certificate" "lb_cert" {
  name = "ai-governance-cert${local.env_suffix}"

  managed {
    domains = [var.platform_domain]
  }
}

# HTTPS proxy
resource "google_compute_target_https_proxy" "lb_https_proxy" {
  name             = "ai-governance-https-proxy${local.env_suffix}"
  url_map          = google_compute_url_map.lb_url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.lb_cert.id]
}

# HTTP to HTTPS redirect
resource "google_compute_url_map" "lb_http_redirect" {
  name = "ai-governance-http-redirect${local.env_suffix}"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

# HTTP proxy (redirects to HTTPS)
resource "google_compute_target_http_proxy" "lb_http_proxy" {
  name    = "ai-governance-http-proxy${local.env_suffix}"
  url_map = google_compute_url_map.lb_http_redirect.id
}

# Forwarding rule for HTTPS
resource "google_compute_global_forwarding_rule" "lb_https" {
  name                  = "ai-governance-https${local.env_suffix}"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.lb_https_proxy.id
  ip_address            = google_compute_global_address.lb_ip.id
}

# Forwarding rule for HTTP
resource "google_compute_global_forwarding_rule" "lb_http" {
  name                  = "ai-governance-http${local.env_suffix}"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "80"
  target                = google_compute_target_http_proxy.lb_http_proxy.id
  ip_address            = google_compute_global_address.lb_ip.id
}

# Outputs
output "load_balancer_ip" {
  description = "Static IP address of the load balancer"
  value       = google_compute_global_address.lb_ip.address
}

output "load_balancer_url" {
  description = "HTTPS URL to access the platform (single entry point)"
  value       = "https://${var.platform_domain}"
}

output "ssl_certificate_status" {
  description = "SSL certificate provisioning status"
  value       = google_compute_managed_ssl_certificate.lb_cert.id
}

output "load_balancer_routing" {
  description = "URL routing (matches nginx.conf)"
  value = {
    platform       = "https://${var.platform_domain}"
    controlnet_api = "https://${var.platform_domain}/v1/"
    modelguard_api = "https://${var.platform_domain}/modelguard/"
    web_ui         = "https://${var.platform_domain}/"
    web_api        = "https://${var.platform_domain}/api/"
    docs           = "https://${var.platform_domain}/docs"
    health         = "https://${var.platform_domain}/healthz"
  }
}

output "upgrade_to_custom_domain" {
  description = "Instructions to upgrade to dev.kentron.ai"
  value       = <<-EOT
    To upgrade to custom domain:
    1. Verify your domain at https://search.google.com/search-console
    2. Set var.platform_domain (terraform.tfvars or workspace var) to dev.kentron.ai
    3. Run: terraform apply
    4. Add DNS A record: dev.kentron.ai -> ${google_compute_global_address.lb_ip.address}
    5. Wait 10-60 minutes for SSL provisioning
  EOT
}
