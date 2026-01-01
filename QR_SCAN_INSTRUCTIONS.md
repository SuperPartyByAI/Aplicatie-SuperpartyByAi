# 📱 SCAN QR CODE - WHATSAPP CONNECTION

## Account 1: Test Account (+40737571397)
**QR URL:** https://whats-upp-production.up.railway.app/api/whatsapp/qr/account_dev_dde908a65501c63b124cb94c627e551d

## Account 2: Test Account 2 (+40123456789)
**QR URL:** https://whats-upp-production.up.railway.app/api/whatsapp/qr/account_dev_4abd0b81b61a636f36880426d4628bb0

## How to Scan:
1. Open WhatsApp on your phone
2. Go to **Settings → Linked Devices**
3. Tap **"Link a Device"**
4. Scan the QR code from the URL above

## Verify Connection:
After scanning, check status:
```bash
curl -s https://whats-upp-production.up.railway.app/health | python3 -m json.tool
```

Expected result:
```json
{
  "accounts": {
    "total": 2,
    "connected": 1,  // Should increase after scan
    "connecting": 0,
    "needs_qr": 1
  }
}
```

## Test Message Sending:
Once connected, test with:
```bash
curl -X POST https://whats-upp-production.up.railway.app/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "account_dev_dde908a65501c63b124cb94c627e551d",
    "to": "+40737571397",
    "message": "Test from Railway!"
  }'
```
