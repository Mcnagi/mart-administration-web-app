// Raw Firestore calls for the `companies` collection: the admin-managed
// code -> company name map. No business rules here — that belongs in
// services/companyService.js.
import { doc, addDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const companiesCol = collection(db, 'companies');

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
