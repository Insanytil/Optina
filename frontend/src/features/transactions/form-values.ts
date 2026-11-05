import { z } from 'zod'

export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function isPositiveAmount(value: string) {
  if (!/^\d{1,17}([.,]\d{1,2})?$/.test(value)) return false
  const [whole, fraction = ''] = value.replace(',', '.').split('.')
  return BigInt(whole + fraction.padEnd(2, '0')) > 0n
}
export function transactionFormSchema(opening: boolean) {
  return z
    .object({
      wallet_id: z.string().min(1, 'Choisissez un portefeuille.'),
      category_id: z.string(),
      type: z.enum(['expense', 'income']),
      amount: z
        .string()
        .trim()
        .refine(
          isPositiveAmount,
          'Saisissez un montant positif avec au maximum 2 décimales.',
        ),
      date: z.iso
        .date('Saisissez une date valide.')
        .refine(
          (date) => date <= localToday(),
          'La date ne peut pas être dans le futur.',
        ),
      label: z
        .string()
        .trim()
        .min(1, 'Saisissez un libellé.')
        .max(255, '255 caractères maximum.'),
      note: z.string().max(5000, '5 000 caractères maximum.'),
    })
    .superRefine((values, context) => {
      if (!opening && !values.category_id)
        context.addIssue({
          code: 'custom',
          path: ['category_id'],
          message: 'Choisissez une catégorie.',
        })
    })
}
