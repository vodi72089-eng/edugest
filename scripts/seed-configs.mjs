import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const S2 = 'cmud3g97k0005tk74ncj1dgjj'; // kivu
// Currency config for s2
await p.schoolCurrencyConfig.upsert({
  where: { schoolId: S2 },
  create: { schoolId: S2, baseCurrency: 'USD', displayCurrency: 'USD', enabledCurrencies: 'USD,CDF', useManualRates: false },
  update: { baseCurrency: 'USD', displayCurrency: 'USD', enabledCurrencies: 'USD,CDF', useManualRates: false },
});
// WhatsApp config for s2
const adminKivu = await p.user.findFirst({ where: { email: 'admin@kivu.cd' }, select: { id: true } });
await p.globalApiConfig.upsert({
  where: { key: `WHATSAPP_SCHOOL_CONFIG_${S2}` },
  create: { key: `WHATSAPP_SCHOOL_CONFIG_${S2}`, value: JSON.stringify({ phoneNumber: '+243899999999', isConnected: true, connectedAt: new Date().toISOString() }), updatedBy: adminKivu.id },
  update: { value: JSON.stringify({ phoneNumber: '+243899999999', isConnected: true, connectedAt: new Date().toISOString() }) },
});
console.log('seeded s2 configs');
await p.$disconnect();
