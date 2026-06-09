import { db } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit, orderBy } from 'firebase/firestore/lite';

// A lightweight Firebase-backed Prisma mock to ensure edge compatibility
const createPrismaModelMock = (modelName) => {
  const colName = modelName.toLowerCase() + 's'; // simple pluralization e.g. user -> users

  return {
    findUnique: async ({ where: clause }) => {
      try {
        if (clause.id) {
          const snap = await getDoc(doc(db, colName, clause.id));
          if (!snap.exists()) return null;
          return { id: snap.id, ...snap.data() };
        }
        
        // Find by unique field like email
        const keys = Object.keys(clause);
        if (keys.length > 0) {
          const q = query(collection(db, colName), where(keys[0], '==', clause[keys[0]]), limit(1));
          const snap = await getDocs(q);
          if (snap.empty) return null;
          return { id: snap.docs[0].id, ...snap.docs[0].data() };
        }
        return null;
      } catch (e) {
        console.error(`Firebase Prisma mock findUnique error on ${modelName}:`, e);
        return null;
      }
    },
    findFirst: async ({ where: clause }) => {
      return this.findUnique({ where: clause });
    },
    findMany: async ({ where: clause }) => {
      try {
        let q = collection(db, colName);
        if (clause) {
          const keys = Object.keys(clause);
          if (keys.length > 0) {
            q = query(q, where(keys[0], '==', clause[keys[0]])); // Simplified where
          }
        }
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        return [];
      }
    },
    create: async ({ data }) => {
      try {
        const id = data.id || crypto.randomUUID();
        await setDoc(doc(db, colName, id), data);
        return { id, ...data };
      } catch (e) {
        console.error(e);
        return data;
      }
    },
    update: async ({ where: clause, data }) => {
      try {
        if (clause.id) {
          await updateDoc(doc(db, colName, clause.id), data);
          return { id: clause.id, ...data };
        }
        return data;
      } catch (e) {
        console.error(e);
        return data;
      }
    },
    delete: async ({ where: clause }) => {
      try {
        if (clause.id) {
          await deleteDoc(doc(db, colName, clause.id));
        }
        return clause;
      } catch (e) {
        return clause;
      }
    }
  }
};

const createPrismaMock = () => {
  return new Proxy({}, {
    get(target, model) {
      if (model === '$transaction') return async (fn) => typeof fn === 'function' ? fn() : (Array.isArray(fn) ? fn : []);
      if (model === '$disconnect') return async () => {};
      if (model === '$connect') return async () => {};

      return createPrismaModelMock(model);
    }
  });
}

export const prisma = createPrismaMock();
export const PrismaClient = function() {
  return prisma;
};
