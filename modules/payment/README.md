# payment

Owns the compatibility payment-instruction projection and repayment routing.
Provider payment preparation is backed by the event-sourced Rail aggregate; the
module no longer keeps an independent payment state store. It does not move
production funds. Repayment routing calls public service interfaces supplied by
composition code.

Public interfaces: `PaymentService`, `RepaymentRouter`.
