# FleetWise Johannesburg production Functions

This codebase is the full v2 production port for Firebase project
`fleetwise-prod-jhb`. Every callable is configured for `africa-south1`, uses the
project's `(default)` Firestore database, and writes inspection photos only to
`fleetwise-prod-jhb.firebasestorage.app`.

## Callable transport and authorization

Firebase v2 callable functions run as Cloud Run services. At deployment time,
the callable services must permit public invocation at the transport layer so
Firebase callable requests can reach the Functions framework. Application
authorization remains inside each callable: admin operations require Firebase
Authentication plus an active admin profile, and driver operations retain the
FleetWise driver-session contract.

No IAM changes are performed by this codebase preparation.
