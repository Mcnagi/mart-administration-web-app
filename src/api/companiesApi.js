// Raw Firestore calls for the `companies` collection: the admin-managed
// code -> company name map. No business rules here — that belongs in
// services/companyService.js.
import { doc, addDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const companiesCol = collection(db, 'companies');

// Firestore batch writes are capped at 500 operations; stay under that for
// headroom (matches the pattern used elsewhere for chunked imports).
const BATCH_SIZE = 450;

export async function listCompanies() {
  const snap = await getDocs(companiesCol);
  writeLog('read', { action: 'list', collectionName: 'companies' });
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createCompany(code, name) {
  const ref = await addDoc(companiesCol, { code, name, createdAt: serverTimestamp() });
  writeLog('write', { action: 'create', collectionName: 'companies', docId: ref.id });
  return ref;
}

export async function updateCompany(id, code, name) {
  await updateDoc(doc(companiesCol, id), { code, name, updatedAt: serverTimestamp() });
  writeLog('write', { action: 'update', collectionName: 'companies', docId: id });
}

export async function deleteCompany(id) {
  await deleteDoc(doc(companiesCol, id));
  writeLog('write', { action: 'delete', collectionName: 'companies', docId: id });
}

// Bulk create/update from a parsed CSV/Excel file (see
// companyService.parseCompaniesFile), matched against the full existing list
// (already in memory, so no per-row read is needed — unlike the much larger
// `data` collection's upsertRowsByBarcode). A row whose code already exists
// with the same name is left untouched; otherwise it's created or updated in
// batches of BATCH_SIZE.
export async function upsertCompaniesByCode(existingCompanies, rows) {
  const byCode = new Map(existingCompanies.map((c) => [c.code, c]));
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ code, name }) => {
      const existing = byCode.get(code);
      if (existing) {
        if (existing.name === name) return;
        batch.update(doc(companiesCol, existing.id), { code, name, updatedAt: serverTimestamp() });
      } else {
        batch.set(doc(companiesCol), { code, name, createdAt: serverTimestamp() });
      }
      written += 1;
    });
    await batch.commit();
  }
  writeLog('write', { action: 'bulkImport', collectionName: 'companies', count: written });
  return { written };
}
