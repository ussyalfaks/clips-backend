# Security Policy

## Supported Versions

Only the latest version of our application receives security updates. We recommend always using the latest version.

| Version | Supported          |
|---------|-------------------|
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

We take the security of our application seriously and appreciate your efforts to responsibly disclose vulnerabilities.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please send your report to: **security@clips-backend.com**

### What to Include

Please include the following information in your report:

- **Type of vulnerability** (e.g., XSS, SQL Injection, Authentication Bypass, etc.)
- **Affected versions** of the application
- **Step-by-step instructions** to reproduce the vulnerability
- **Proof of concept** or exploit code (if available)
- **Potential impact** of the vulnerability
- **Screenshots** or videos (if applicable)

### Response Timeline

We aim to respond to security reports within **48 hours** and provide a detailed analysis within **7 days**. Here's our typical timeline:

- **Within 48 hours**: Initial response and acknowledgment
- **Within 7 days**: Detailed analysis and planned resolution
- **Within 30 days**: Security patch release (depending on complexity)

### Safe Harbor

Security research conducted under this policy is considered authorized and we will not take legal action against researchers who:

- Follow the guidelines outlined in this policy
- Do not violate any applicable laws
- Do not harm our users or systems
- Report vulnerabilities to us before disclosing them publicly

### Rewards

We offer monetary rewards for valid security vulnerabilities based on severity:

| Severity | Reward Range |
|----------|--------------|
| Critical | $500 - $2,000 |
| High     | $200 - $500 |
| Medium   | $100 - $200 |
| Low      | $50 - $100 |

Rewards are determined at our discretion based on the CVSS score and actual impact.

### Out of Scope

The following are out of scope for our bug bounty program:

- Vulnerabilities in third-party services we use
- Social engineering attacks
- Physical attacks on our infrastructure
- Denial of service attacks
- Spamming or rate limiting issues
- Missing security headers (unless they lead to a direct vulnerability)
- Theoretical vulnerabilities without demonstrated impact

### Public Disclosure

We request that researchers do not disclose vulnerabilities publicly until we have had reasonable time to address them (typically 30 days).

Once a vulnerability is fixed, we will:

1. Credit the researcher in our security acknowledgments (with permission)
2. Publicly disclose the vulnerability details
3. Issue a CVE if applicable

### Security Features

Our application includes several security features:

- **Device Fingerprinting**: Refresh tokens are bound to specific device/browser fingerprints
- **Brute Force Protection**: Account lockout after 5 failed login attempts for 15 minutes
- **Multi-Factor Authentication**: TOTP-based 2FA support
- **Secure Password Storage**: Bcrypt with salt rounds
- **JWT Security**: Short-lived access tokens with refresh token rotation
- **Rate Limiting**: API endpoint rate limiting
- **HTTPS Enforcement**: All communications encrypted in transit

### Encryption

- **Data in Transit**: TLS 1.2+ with perfect forward secrecy
- **Data at Rest**: Encrypted storage where applicable
- **Password Reset**: Secure token-based password resets
- **Email Communications**: Encrypted when possible

### Contact

For security-related inquiries:
- **Security Team**: security@clips-backend.com
- **PGP Key**: Available at https://www.clips-backend.com/pgp-key.txt

Thank you for helping keep our application secure!
