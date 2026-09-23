import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Assembly, Voter } from '../engine/types';
import { CHANNEL_LABEL } from '../engine/types';
import { encodeCheckin } from '../engine/tellerCodes';

/**
 * Printable voting cards, eight to a page. Each carries a QR code that identifies the member
 * within this election only — no name or email is encoded — so the registration desk can scan
 * people in as they arrive.
 */
export function VotingCards({ assembly, voters }: { assembly: Assembly; voters: Voter[] }) {
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const build = async () => {
      const out: Record<string, string> = {};
      for (const v of voters) {
        try {
          out[v.id] = await QRCode.toDataURL(encodeCheckin({ v: 1, a: assembly.id, i: v.id }), {
            errorCorrectionLevel: 'M',
            margin: 0,
            width: 240,
          });
        } catch {
          /* a card without a QR still works — the desk can search the name */
        }
      }
      if (alive) setCodes(out);
    };
    void build();
    return () => {
      alive = false;
    };
  }, [assembly.id, voters]);

  const roleOf = (v: Voter) => assembly.roles.find((r) => r.id === v.roleId);

  return (
    <div className="cards">
      {voters.map((v) => {
        const role = roleOf(v);
        const alternateFor = role?.alternateFor ? assembly.roles.find((r) => r.id === role.alternateFor)?.name : null;
        return (
          <div className="card" key={v.id}>
            <div className="card-head">
              <span>{assembly.name}</span>
              <span>{assembly.date}</span>
            </div>
            <div className="card-body">
              <div>
                <div className="card-name">{v.name}</div>
                <div className="card-role">{role?.name ?? ''}</div>
                <div className="card-where">
                  {[v.group, v.district && `District ${v.district.replace(/^d(istrict)?\s*/i, '')}`].filter(Boolean).join(' · ')}
                </div>
                <div className="card-where">{CHANNEL_LABEL[v.channel]}</div>
              </div>
              {codes[v.id] && <img className="card-qr" src={codes[v.id]} alt="" width={96} height={96} />}
            </div>
            <div className={`card-band ${role?.votes ? (alternateFor ? 'alt' : 'votes') : 'novote'}`}>
              {role?.votes
                ? alternateFor
                  ? `ALTERNATE — votes only if the ${alternateFor} is absent`
                  : 'VOTING MEMBER'
                : 'NON-VOTING'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
