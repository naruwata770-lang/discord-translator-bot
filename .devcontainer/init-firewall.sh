#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, and pipeline failures
IFS=$'\n\t'       # Stricter word splitting

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# --- Default Policies ---
# Set default policies to DROP first. This means any traffic not explicitly allowed will be blocked.
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# --- INPUT Rules (Incoming Traffic) ---
# Allow all incoming traffic from the local loopback interface
iptables -A INPUT -i lo -j ACCEPT
# Allow incoming traffic that is part of an established or related connection (e.g., responses to our requests)
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# --- OUTPUT Rules (Outgoing Traffic) ---
# Allow all outgoing traffic to the local loopback interface
iptables -A OUTPUT -o lo -j ACCEPT
# Allow outgoing traffic that is part of an established or related connection
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow outbound DNS requests (required to resolve domain names)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Allow outbound SSH requests
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT

# Allow outbound HTTP and HTTPS traffic for AI web searches etc.
iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

# --- Allow access to the host machine's network ---
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -n "$HOST_IP" ]; then
    HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
    echo "Host network detected as: $HOST_NETWORK. Allowing access."
    iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
    iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT
else
    echo "WARNING: Could not detect host IP. Access to host network is not configured."
fi

echo "Firewall configuration complete."
echo "Verifying firewall rules..."

# Verify that a standard HTTPS site is now reachable
if curl --connect-timeout 5 https://www.google.com >/dev/null 2>&1; then
    echo "Firewall verification passed - able to reach https://www.google.com as expected."
else
    echo "ERROR: Firewall verification failed - was unable to reach https://www.google.com"
    exit 1
fi