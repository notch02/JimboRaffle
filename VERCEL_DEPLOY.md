# JimboRaffle - Vercel Deployment

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/JimboRaffle)

## Setup Steps

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy

```bash
# From project directory
vercel

# For production
vercel --prod
```

### 4. Configure Custom Domain

1. Go to Vercel Dashboard
2. Select your project
3. Go to Settings > Domains
4. Add your custom domain
5. Follow DNS configuration instructions

### 5. Environment Variables (Optional)

Se vuoi configurare variabili d'ambiente:

1. Vercel Dashboard > Settings > Environment Variables
2. Aggiungi:
   - `SOLANA_NETWORK` = `mainnet-beta`
   - `PROGRAM_ID` = `your_program_id`

## DNS Configuration

### Namecheap / GoDaddy / Other Registrars

Add these DNS records:

**For root domain (example.com):**
```
Type: A
Name: @
Value: 76.76.21.21
```

**For www subdomain:**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

## Post-Deployment Checklist

- [ ] Verify site loads correctly
- [ ] Test wallet connection
- [ ] Test raffle creation
- [ ] Check mobile responsiveness
- [ ] Verify custom domain works
- [ ] Test all features on production

## Estimated Costs

- **Vercel Hosting**: FREE (Hobby plan)
- **Custom Domain**: $10-15/year
- **Total**: ~$10-15/year

## Support

Issues? Check:
- Vercel Deployment Logs
- Browser Console
- Network Tab
