# Multistream architecture and operations

StreamBrew uses a split control-plane/media-plane architecture for multistream.
The application, authentication, PostgreSQL, configuration, and session history
remain on AWS. A stateless Hetzner Cloud server accepts one RTMP publish from
OBS and forwards the unchanged stream to as many as three enabled destinations.

Hetzner hosting is currently paused: the media server and its Primary IPs have
been deleted, and multistream is unavailable. The GitHub workflow is disabled
and the repository variable `HETZNER_RESTREAM_ENABLED` is `false`. Keep both
disabled until hosting is explicitly requested again. Application data and
encrypted destination credentials remain on AWS.

## Request flow

1. A streamer creates an ingest key and saves destination RTMP credentials in
   the AWS application.
2. The web service encrypts each destination key with
   `RESTREAM_CREDENTIALS_SECRET` before storing it in PostgreSQL.
3. OBS publishes to `RESTREAM_INGEST_URL/<ingest-key>`.
4. MediaMTX asks the node-local Go controller to authenticate the publisher.
5. The controller calls the AWS endpoint over HTTPS using
   `RESTREAM_MEDIA_SHARED_SECRET`.
6. AWS verifies the ingest key, opens a session, decrypts the enabled
   destination keys, and returns temporary target URLs.
7. After MediaMTX accepts the publisher, its online hook installs the ephemeral
   forward configuration. MediaMTX forwards the original H.264/AAC stream while
   the node sends heartbeat statistics to AWS, then removes the configuration
   and ends the session when the publisher disconnects.

The Hetzner server has no database access and does not persist destination
credentials. Target URLs exist only in the controller process for the duration
of a live session. Playback and all non-publish MediaMTX actions are denied.
Resolved targets in private, loopback, link-local, documentation, and other
special-use networks are rejected before forwarding.

There is no transcoding. OBS must produce a stream accepted by every selected
destination, normally H.264 video with AAC audio. This keeps CPU cost low and
avoids quality loss, but it means StreamBrew cannot produce platform-specific
resolutions or bitrates.

## Provision the Hetzner node

Provision only after an explicit decision to resume paid hosting. Keep the
workflow disabled and `HETZNER_RESTREAM_ENABLED=false` until the node is ready.

Install `hcloud` 1.68.0 or later. Create a read/write API token in the Hetzner
project, then store it in a local context without putting it in shell history:

```sh
read -s HCLOUD_TOKEN
export HCLOUD_TOKEN
hcloud context create --token-from-env streambrew
unset HCLOUD_TOKEN
```

Create a dedicated key pair outside the repository and register its public
half. Never reuse the AWS deployment key.

```sh
ssh-keygen -t ed25519 -f ~/.ssh/streambrew_hetzner_restream -C streambrew-hetzner-restream
hcloud ssh-key create \
  --name streambrew-restream-deploy \
  --public-key-from-file ~/.ssh/streambrew_hetzner_restream.pub
```

Create a firewall. SSH must be public because GitHub-hosted runners have no
stable source addresses; strict host-key verification and the dedicated key
remain the authentication boundary. RTMP is public so streamers can publish
from OBS; the high-entropy ingest key is checked before a stream is accepted.

```sh
hcloud firewall create --name streambrew-restream
hcloud firewall add-rule streambrew-restream \
  --direction in --protocol tcp --port 22 --source-ips 0.0.0.0/0,::/0 \
  --description "GitHub Actions SSH"
hcloud firewall add-rule streambrew-restream \
  --direction in --protocol tcp --port 1935 --source-ips 0.0.0.0/0,::/0 \
  --description "OBS RTMP ingest"
```

Create a small x86 server in Nuremberg. Check the displayed monthly price
before confirming it against the operating budget; the node does not need a
volume, backup, or private network because it is stateless.

```sh
hcloud server create \
  --name streambrew-restream-nbg1-1 \
  --type cx23 \
  --image ubuntu-24.04 \
  --location nbg1 \
  --ssh-key streambrew-restream-deploy \
  --firewall streambrew-restream \
  --enable-protection delete,rebuild \
  --user-data-from-file infra/hetzner/cloud-init.yml
```

Wait for cloud-init and inspect the server through `hcloud`:

```sh
hcloud server describe streambrew-restream-nbg1-1
server_ip="$(hcloud server ip streambrew-restream-nbg1-1)"
ssh -i ~/.ssh/streambrew_hetzner_restream streambrew@"$server_ip" \
  cloud-init status --wait
```

## GitHub Production environment

Add these Hetzner deployment values:

| Kind     | Name                           | Value                                      |
| -------- | ------------------------------ | ------------------------------------------ |
| variable | `HETZNER_RESTREAM_SERVER`      | `streambrew-restream-nbg1-1`               |
| secret   | `HETZNER_API_TOKEN`            | project-scoped read/write API token        |
| secret   | `HETZNER_SSH_PRIVATE_KEY`      | dedicated private key                      |
| secret   | `HETZNER_SSH_KNOWN_HOSTS`      | pinned host key under the deployment alias |
| secret   | `RESTREAM_MEDIA_SHARED_SECRET` | random 32-byte-or-longer shared secret     |

Generate the known-host entry only after checking the ED25519 fingerprint in
the Hetzner console:

```sh
server_ip="$(hcloud server ip streambrew-restream-nbg1-1)"
ssh-keyscan -t ed25519 "$server_ip" | \
  sed "s/^$server_ip/streambrew-restream/"
```

The AWS application uses the same `RESTREAM_MEDIA_SHARED_SECRET` plus these
values in the `Production` environment:

| Kind     | Name                           | Value                                     |
| -------- | ------------------------------ | ----------------------------------------- |
| variable | `RESTREAM_INGEST_URL`          | `rtmp://<node-ip-or-dns-name>:1935`       |
| secret   | `RESTREAM_CREDENTIALS_SECRET`  | independent random 32-byte encryption key |
| secret   | `RESTREAM_MEDIA_SHARED_SECRET` | the same value as on the media node       |

Rotating `RESTREAM_CREDENTIALS_SECRET` requires re-encrypting every saved
destination key first. Rotating `RESTREAM_MEDIA_SHARED_SECRET` requires an
ordered deployment of both planes and briefly prevents new streams, so do it
during a maintenance window.

## Releases and verification

The workflow's media jobs run only when the **repository** variable
`HETZNER_RESTREAM_ENABLED` is exactly `true`; a missing variable also skips them.
This gate applies to releases and manual dispatches. Keep it at repository scope
so revision resolution can check it before entering the `Production` environment.

`.github/workflows/restream.yml` builds an immutable `linux/amd64` image, uses
`hcloud` to resolve the configured server, copies only the Compose definition
and generated runtime environment, then waits for the container health check
and the public RTMP listener. It runs when the media-plane files change and can
also deploy an explicit revision manually.

To resume hosting, provision the node, update `HETZNER_RESTREAM_SERVER` and the
pinned SSH host key, then explicitly enable deployments:

```sh
gh variable set HETZNER_RESTREAM_ENABLED --body true
gh workflow enable restream.yml
```

Run the workflow after the node is ready and before publishing the new
`RESTREAM_INGEST_URL` to the application through an AWS application deployment.
Verify:

```sh
hcloud server describe streambrew-restream-nbg1-1
ssh streambrew-restream \
  'cd /opt/streambrew-restream && docker compose --env-file runtime.env ps'
nc -vz "$(hcloud server ip streambrew-restream-nbg1-1)" 1935
```

Then add one temporary destination in StreamBrew and publish a short H.264/AAC
test stream from OBS. Confirm that the interface changes from `Connecting` to
`Live`, outbound bytes increase, the destination receives the stream, and the
session ends after OBS disconnects. Remove the temporary destination afterward.

## Recovery and removal

### Pause without ongoing Hetzner charges

Disable deployments before removing resources. Check the workflow's
[Actions page](https://github.com/streambrew-app/streambrew/actions/workflows/restream.yml)
and cancel any queued or running media deployments:

```sh
gh variable set HETZNER_RESTREAM_ENABLED --body false
gh workflow disable restream.yml
```

Verify that there are no active RTMP publishers on the node. Replace the
`Production` variable `RESTREAM_INGEST_URL` with `rtmp://127.0.0.1:1935` so future
AWS releases cannot advertise an address that Hetzner may reassign. The running
AWS application loads this value at startup; apply it through the normal AWS
deployment before reusing multistream.

Delete the stateless server using the commands below, then verify that its
Primary IPs were automatically deleted. Delete any retained IPs explicitly.
[Hetzner bills stopped servers and retained Primary IPv4 addresses](https://docs.hetzner.com/cloud/billing/faq/),
so powering down the node does not stop charges. Do not create a paid snapshot
to preserve this disposable node.

Inspect the StreamBrew project for other billable resources:

```sh
hcloud server list
hcloud primary-ip list
hcloud floating-ip list
hcloud volume list
hcloud load-balancer list
hcloud image list --type snapshot
hcloud image list --type backup
hcloud storage-box list
```

Remove any remaining StreamBrew billable resources after checking their data;
do not delete resources belonging to other services. Charges already accrued
before deletion may still appear on a final invoice.

### Replace or delete the node

The node is disposable. If it is lost, create a replacement with the same
cloud-init file, update the GitHub server variable and known-host secret, deploy
the media workflow, then update `RESTREAM_INGEST_URL`. No database restore is
involved.

Deletion protection is enabled. Removing the node is therefore an explicit
two-step operation:

```sh
hcloud server disable-protection streambrew-restream-nbg1-1 delete rebuild
hcloud server delete streambrew-restream-nbg1-1
```

Before removal, follow the pause procedure above. Destination credentials remain
encrypted on AWS and do not need to be recovered from the media node.
