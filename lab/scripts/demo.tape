# VHS Tape File for Airlock North-Star Demo GIF Recording
# Requirements: vhs (https://github.com/charmbracelet/vhs)
# Usage: vhs lab/scripts/demo.tape

Output docs/assets/airlock-demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1280
Set Height 800
Set Padding 20
Set Theme "Monokai Pro"
Set CornerRadius 10

# 1. Boot up lab environment
Type "bash lab/scripts/setup-lab.sh"
Enter
Sleep 1.5s

# 2. Inject incident chaos
Type "bash lab/scripts/break-checkout-api.sh"
Enter
Sleep 2s

# 3. Query cluster status
Type "cargo run --bin airlock -- status"
Enter
Sleep 2.5s

# 4. Investigate root cause with offline AI
Type "cargo run --bin airlock -- why checkout-api"
Enter
Sleep 4s

# 5. Verify security boundary blocking unauthorized mutation
Type "cargo run --bin airlock -- k8s mutate 'kubectl delete deployment checkout-api'"
Enter
Sleep 3s

# 6. View immutable audit ledger
Type "cargo run --bin airlock -- audit-log"
Enter
Sleep 4s
