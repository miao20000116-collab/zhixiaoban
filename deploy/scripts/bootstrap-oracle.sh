#!/usr/bin/env bash
# Oracle Cloud Ubuntu VM 一键安装 Docker（在 VM 上执行一次）
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 或 sudo 运行"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git ufw

# Docker CE
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

systemctl enable docker
systemctl start docker

# 防火墙：SSH + HTTP + HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable || true

echo ""
echo "Docker 安装完成。接下来："
echo "  1. git clone 你的项目到 /opt/zhixiaoban"
echo "  2. cp deploy/.env.example deploy/.env 并填写"
echo "  3. cd /opt/zhixiaoban && docker compose -f deploy/docker-compose.yml up -d --build"
