import { useState, useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { db } from '../firebase/config';

/**
 * Returns live list of members in a group.
 * Assumes DB structure: groups/{groupId}/members/{uid} = { name, email, photoURL }
 */
export function useGroupMembers(groupId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return;
    const membersRef = ref(db, `groups/${groupId}/members`);

    const listener = onValue(membersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, item]) => ({ id, ...item }));
        setMembers(list);
      } else {
        setMembers([]);
      }
      setLoading(false);
    });

    return () => off(membersRef, 'value', listener);
  }, [groupId]);

  return { members, loading };
}
