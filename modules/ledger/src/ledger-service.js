import {
  CreditEventType,
  DomainError,
  LedgerAccountStatus,
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerNormalSide,
  assertEnumValue,
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  createCreditEvent,
  createLedgerAccount,
  createLedgerEntry,
  createLedgerTransaction,
  enumValues,
  hashId
} from "../../../packages/domain/src/index.js";

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function matchesFilter(value, filter) {
  return Object.entries(filter).every(([key, expected]) => expected === undefined || value[key] === expected);
}

export class LedgerService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
    this.accounts = new Map();
    this.accountIdsByNaturalKey = new Map();
    this.transactions = new Map();
    this.transactionIdsByIdempotencyKey = new Map();
    this.entries = [];
  }

  openAccount({ ownerType, ownerId, assetId, accountType, normalSide, subjectId, now = new Date() }) {
    assertNonEmptyString("ownerType", ownerType);
    assertNonEmptyString("ownerId", ownerId);
    assertNonEmptyString("assetId", assetId);
    assertEnumValue("accountType", accountType, enumValues(LedgerAccountType));
    assertEnumValue("normalSide", normalSide, enumValues(LedgerNormalSide));
    const naturalKey = `${ownerType}\0${ownerId}\0${assetId}\0${accountType}`;
    const existingId = this.accountIdsByNaturalKey.get(naturalKey);
    if (existingId) {
      const existing = this.#requireAccount(existingId);
      if (existing.normalSide !== normalSide) {
        throw new DomainError("ledger_account_conflict", "ledger account natural key has a different normal side", {
          ledgerAccountId: existingId
        });
      }
      return clone(existing);
    }

    const account = createLedgerAccount({ ownerType, ownerId, assetId, accountType, normalSide, now });
    this.accounts.set(account.ledgerAccountId, deepFreeze(clone(account)));
    this.accountIdsByNaturalKey.set(naturalKey, account.ledgerAccountId);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.LEDGER_ACCOUNT_OPENED,
        subjectId,
        payload: {
          ledgerAccountId: account.ledgerAccountId,
          ledgerAccountHash: account.ledgerAccountHash,
          ownerType,
          ownerId,
          assetId,
          accountType,
          normalSide
        },
        now
      })
    );
    return clone(account);
  }

  postTransaction({
    idempotencyKey,
    transactionType,
    assetId,
    entries,
    referenceType,
    referenceId,
    subjectId,
    metadata = {},
    now = new Date()
  }) {
    assertNonEmptyString("idempotencyKey", idempotencyKey);
    assertNonEmptyString("transactionType", transactionType);
    assertNonEmptyString("assetId", assetId);
    assertNonEmptyString("referenceType", referenceType);
    assertNonEmptyString("referenceId", referenceId);
    assertNoRawPiiReference(metadata, "ledger.metadata");
    if (!Array.isArray(entries) || entries.length < 2) {
      throw new DomainError("ledger_entries_required", "ledger transaction requires at least two entries");
    }

    const seenAccountIds = new Set();
    const normalizedEntries = entries.map((entry, sequence) => {
      assertNonEmptyString("ledgerAccountId", entry.ledgerAccountId);
      assertEnumValue("direction", entry.direction, enumValues(LedgerEntryDirection));
      const amount = assertPositiveMinorUnits(entry.amountMinor);
      if (seenAccountIds.has(entry.ledgerAccountId)) {
        throw new DomainError("duplicate_ledger_account_entry", "an account may appear only once per transaction", {
          ledgerAccountId: entry.ledgerAccountId
        });
      }
      seenAccountIds.add(entry.ledgerAccountId);
      const account = this.#requireAccount(entry.ledgerAccountId);
      if (account.status !== LedgerAccountStatus.ACTIVE) {
        throw new DomainError("ledger_account_not_active", "ledger posting requires active accounts", {
          ledgerAccountId: account.ledgerAccountId,
          status: account.status
        });
      }
      if (account.assetId !== assetId) {
        throw new DomainError("ledger_asset_mismatch", "all ledger accounts must match the transaction asset", {
          ledgerAccountId: account.ledgerAccountId,
          accountAssetId: account.assetId,
          assetId
        });
      }
      return {
        ledgerAccountId: entry.ledgerAccountId,
        direction: entry.direction,
        amountMinor: amount.toString(),
        sequence
      };
    });

    const debitTotal = normalizedEntries
      .filter((entry) => entry.direction === LedgerEntryDirection.DEBIT)
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
    const creditTotal = normalizedEntries
      .filter((entry) => entry.direction === LedgerEntryDirection.CREDIT)
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
    if (debitTotal !== creditTotal) {
      throw new DomainError("unbalanced_ledger_transaction", "ledger debits and credits must balance", {
        debitTotalMinor: debitTotal.toString(),
        creditTotalMinor: creditTotal.toString()
      });
    }

    const transactionHash = hashId("ledger_transaction", {
      idempotencyKey,
      transactionType,
      assetId,
      referenceType,
      referenceId,
      metadata,
      entries: normalizedEntries
    });
    const existingTransactionId = this.transactionIdsByIdempotencyKey.get(idempotencyKey);
    if (existingTransactionId) {
      const existing = this.transactions.get(existingTransactionId);
      if (existing.transactionHash !== transactionHash) {
        throw new DomainError("ledger_idempotency_conflict", "idempotency key was reused with a different transaction", {
          idempotencyKey
        });
      }
      return { transaction: this.getTransaction(existingTransactionId), replayed: true };
    }

    const transaction = createLedgerTransaction({
      idempotencyKey,
      transactionType,
      assetId,
      referenceType,
      referenceId,
      metadata,
      normalizedEntries,
      debitTotalMinor: debitTotal.toString(),
      creditTotalMinor: creditTotal.toString(),
      now
    });
    if (transaction.transactionHash !== transactionHash) {
      throw new DomainError("ledger_hash_mismatch", "ledger transaction hash construction is inconsistent");
    }
    const storedEntries = normalizedEntries.map((entry) =>
      createLedgerEntry({
        ledgerTransactionId: transaction.ledgerTransactionId,
        ledgerAccountId: entry.ledgerAccountId,
        direction: entry.direction,
        amountMinor: entry.amountMinor,
        sequence: entry.sequence,
        now
      })
    );

    this.transactions.set(transaction.ledgerTransactionId, deepFreeze(clone(transaction)));
    this.transactionIdsByIdempotencyKey.set(idempotencyKey, transaction.ledgerTransactionId);
    this.entries.push(...storedEntries.map((entry) => deepFreeze(clone(entry))));
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.LEDGER_TRANSACTION_POSTED,
        subjectId,
        payload: {
          ledgerTransactionId: transaction.ledgerTransactionId,
          transactionHash: transaction.transactionHash,
          transactionType,
          assetId,
          referenceType,
          referenceId,
          debitTotalMinor: transaction.debitTotalMinor,
          creditTotalMinor: transaction.creditTotalMinor,
          entryCount: transaction.entryCount
        },
        now
      })
    );
    return { transaction: this.getTransaction(transaction.ledgerTransactionId), replayed: false };
  }

  getAccount(ledgerAccountId) {
    return clone(this.#requireAccount(ledgerAccountId));
  }

  listAccounts(filter = {}) {
    return [...this.accounts.values()].filter((account) => matchesFilter(account, filter)).map(clone);
  }

  getTransaction(ledgerTransactionId) {
    const transaction = this.transactions.get(ledgerTransactionId);
    if (!transaction) {
      throw new DomainError("ledger_transaction_not_found", "ledger transaction not found", { ledgerTransactionId });
    }
    return {
      ...clone(transaction),
      entries: this.entries
        .filter((entry) => entry.ledgerTransactionId === ledgerTransactionId)
        .sort((left, right) => left.sequence - right.sequence)
        .map(clone)
    };
  }

  listTransactions(filter = {}) {
    return [...this.transactions.values()]
      .filter((transaction) => matchesFilter(transaction, filter))
      .map((transaction) => this.getTransaction(transaction.ledgerTransactionId));
  }

  getAccountTurnover(ledgerAccountId, direction) {
    this.#requireAccount(ledgerAccountId);
    assertEnumValue("direction", direction, enumValues(LedgerEntryDirection));
    return this.entries
      .filter((entry) => entry.ledgerAccountId === ledgerAccountId && entry.direction === direction)
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n)
      .toString();
  }

  getAccountBalance(ledgerAccountId) {
    const account = this.#requireAccount(ledgerAccountId);
    const debits = BigInt(this.getAccountTurnover(ledgerAccountId, LedgerEntryDirection.DEBIT));
    const credits = BigInt(this.getAccountTurnover(ledgerAccountId, LedgerEntryDirection.CREDIT));
    const balance = account.normalSide === LedgerNormalSide.DEBIT ? debits - credits : credits - debits;
    return balance.toString();
  }

  getTrialBalance(assetId) {
    assertNonEmptyString("assetId", assetId);
    const accountIds = new Set(this.listAccounts({ assetId }).map((account) => account.ledgerAccountId));
    let debitTotal = 0n;
    let creditTotal = 0n;
    for (const entry of this.entries) {
      if (!accountIds.has(entry.ledgerAccountId)) continue;
      if (entry.direction === LedgerEntryDirection.DEBIT) debitTotal += BigInt(entry.amountMinor);
      else creditTotal += BigInt(entry.amountMinor);
    }
    return {
      assetId,
      debitTotalMinor: debitTotal.toString(),
      creditTotalMinor: creditTotal.toString(),
      balanced: debitTotal === creditTotal
    };
  }

  verifyIntegrity() {
    const violations = [];
    for (const transaction of this.transactions.values()) {
      const entries = this.entries.filter((entry) => entry.ledgerTransactionId === transaction.ledgerTransactionId);
      const debits = entries
        .filter((entry) => entry.direction === LedgerEntryDirection.DEBIT)
        .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
      const credits = entries
        .filter((entry) => entry.direction === LedgerEntryDirection.CREDIT)
        .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
      if (entries.length < 2 || debits !== credits) violations.push(transaction.ledgerTransactionId);
    }
    return { balanced: violations.length === 0, transactionCount: this.transactions.size, violations };
  }

  getSnapshot() {
    const assets = [...new Set([...this.accounts.values()].map((account) => account.assetId))];
    return {
      accountCount: this.accounts.size,
      transactionCount: this.transactions.size,
      entryCount: this.entries.length,
      integrity: this.verifyIntegrity(),
      trialBalances: assets.map((assetId) => this.getTrialBalance(assetId))
    };
  }

  #requireAccount(ledgerAccountId) {
    const account = this.accounts.get(ledgerAccountId);
    if (!account) throw new DomainError("ledger_account_not_found", "ledger account not found", { ledgerAccountId });
    return account;
  }
}
