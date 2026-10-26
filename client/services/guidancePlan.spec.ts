import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  codeProblem,
  displayStatus,
  generateCodeString,
  DEFAULT_SPONSORS,
  SELF_SPONSORED,
  addAlias,
  addSponsor,
  defaultSponsorList,
  groupLearnersBySponsor,
  isSponsored,
  newSponsorProblem,
  removeSponsor,
  resolveSponsor,
  selfSponsoredCount,
  sponsorLabel,
  sponsorRecordFixes,
  unlistedSponsorNames,
  levelHeading,
  normalizeCodeInput,
  normalizeSponsor,
  shareMessage,
  sortCardsByForm,
  sortLearnersByForm,
} from './guidancePlan';

describe('sponsors', () => {
  it('matches spellings regardless of case, spaces and punctuation', () => {
    expect(normalizeSponsor('  Kalabo  Town Council. ')).toBe('kalabo town council');
    expect(normalizeSponsor('KALABO TOWN-COUNCIL')).toBe('kalabo town council');
  });

  it('leaves out self-sponsored and blank sponsors', () => {
    for (const s of ['Self', 'self ', 'Parent', 'N/A', '', undefined, 'none', 'Guardian']) expect(isSponsored(s)).toBe(false);
    for (const s of ['Government Bursary', 'CAMFED', 'World Vision']) expect(isSponsored(s)).toBe(true);
  });

  it('groups active learners by the sponsors on the list; anything else is self-sponsored', () => {
    const learners = [
      { id: 'a', sponsor: 'CAMFED' },
      { id: 'b', sponsor: 'Camfed' },
      { id: 'c', sponsor: 'CAMFED', status: 'active' },
      { id: 'd', sponsor: 'Self' },
      { id: 'e', sponsor: 'World Vision' },
      { id: 'f', sponsor: 'CAMFED', status: 'graduated' },
      { id: 'g', sponsor: 'C.D.F' },
      { id: 'h', sponsor: 'Mrs Mwale' },
    ];
    const groups = groupLearnersBySponsor(learners, defaultSponsorList());
    // Every listed sponsor appears, biggest first.
    expect(groups.map(g => [g.name, g.count])).toEqual([['CAMFED', 3], ['CDF', 1], ['AP', 0], ['KGS', 0], ['WISE', 0]]);
    expect(groups[0]).toMatchObject({ key: 'camfed', spellings: ['CAMFED', 'Camfed'] });
    expect(groups[0].learnerIds.sort()).toEqual(['a', 'b', 'c']);
    expect(selfSponsoredCount(learners, defaultSponsorList())).toBe(3); // Self, World Vision, Mrs Mwale
  });
});

describe('the sponsor list', () => {
  const list = defaultSponsorList();

  it('starts with KGS, CAMFED, CDF, AP and WISE', () => {
    expect(DEFAULT_SPONSORS).toEqual(['KGS', 'CAMFED', 'CDF', 'AP', 'WISE']);
  });

  it('a typed sponsor counts only when it matches the list; anything else is Self-sponsored', () => {
    expect(resolveSponsor('camfed', list)).toBe('CAMFED');
    expect(resolveSponsor(' C. D. F ', list)).toBe('CDF');
    expect(resolveSponsor('Kgs', list)).toBe('KGS');
    expect(resolveSponsor('Mr John Banda', list)).toBeNull();
    expect(resolveSponsor('Parent', list)).toBeNull();
    expect(sponsorLabel('Mr John Banda', list)).toBe(SELF_SPONSORED);
    expect(sponsorLabel('', list)).toBe(SELF_SPONSORED);
    expect(sponsorLabel('wise', list)).toBe('WISE');
  });

  it('adding a sponsor: refuses duplicates, self words and long names', () => {
    expect(newSponsorProblem('cam fed', list)).toBe('CAMFED is already on the list.');
    expect(newSponsorProblem('Self', list)).toMatch(/means self-sponsored/);
    expect(newSponsorProblem('x'.repeat(41), list)).toMatch(/under 40/);
    expect(newSponsorProblem('  ', list)).toMatch(/Type/);
    const next = addSponsor(list, '  Plan  International ');
    expect(next.names).toEqual([...DEFAULT_SPONSORS, 'Plan International']);
    expect(resolveSponsor('plan international.', next)).toBe('Plan International');
    expect(() => addSponsor(next, 'PLAN INTERNATIONAL')).toThrow(/already on the list/);
    expect(list.names).toEqual(DEFAULT_SPONSORS); // never changed in place
  });

  it('another spelling can be marked as a listed sponsor; removing a sponsor removes its spellings', () => {
    const next = addAlias(list, 'Campaign for Female Education', 'CAMFED');
    expect(resolveSponsor('campaign for female education', next)).toBe('CAMFED');
    expect(newSponsorProblem('Campaign for Female Education', next)).toBe('CAMFED is already on the list.');
    expect(() => addAlias(list, 'x', 'Nobody')).toThrow(/not on the sponsor list/);
    const removed = removeSponsor(next, 'CAMFED');
    expect(removed.names).not.toContain('CAMFED');
    expect(removed.aliases).toEqual({});
    expect(resolveSponsor('Camfed', removed)).toBeNull();
  });

  it('lists the names typed that are not on the list (counted as self-sponsored)', () => {
    const u = unlistedSponsorNames([
      { id: 'a', sponsor: 'World Vision' }, { id: 'b', sponsor: 'world  vision' }, { id: 'c', sponsor: 'Mrs Mwale' },
      { id: 'd', sponsor: 'Parent' }, { id: 'e', sponsor: 'CAMFED' }, { id: 'f', sponsor: 'Old Name', status: 'graduated' },
    ], list);
    expect(u.map(x => [x.name, x.count, x.spellings])).toEqual([['World Vision', 2, ['World Vision', 'world vision']], ['Mrs Mwale', 1, ['Mrs Mwale']]]);
  });

  it('tidying records: current learners get the listed name or Self-sponsored; past learners are left', () => {
    const fixes = sponsorRecordFixes([
      { id: 'a', sponsor: 'Camfed' }, { id: 'b', sponsor: 'CAMFED' }, { id: 'c', sponsor: 'Mr Phiri' },
      { id: 'd', sponsor: '' }, { id: 'e', sponsor: 'Self-sponsored' }, { id: 'f', sponsor: 'Mr Old', status: 'graduated' },
      { id: 'g' },
    ], list);
    expect(fixes).toEqual([
      { id: 'a', from: 'Camfed', to: 'CAMFED' },
      { id: 'c', from: 'Mr Phiri', to: SELF_SPONSORED },
      { id: 'd', from: '', to: SELF_SPONSORED },
      { id: 'g', from: '', to: SELF_SPONSORED },
    ]);
  });
});

describe('order of report cards', () => {
  it('puts lower forms/grades first, then class, then name', () => {
    const cards = [
      { form: '12', className: 'Grade 12A', studentName: 'Zed' },
      { form: '1', className: 'Form 1B', studentName: 'Ann' },
      { form: '10', className: 'Grade 10A', studentName: 'Bob' },
      { form: '1', className: 'Form 1A', studentName: 'Yvonne' },
      { form: '1', className: 'Form 1A', studentName: 'Abel' },
      { form: '2', className: 'Form 2A', studentName: 'Cate' },
    ];
    expect(sortCardsByForm(cards).map(c => `${c.className}/${c.studentName}`)).toEqual([
      'Form 1A/Abel', 'Form 1A/Yvonne', 'Form 1B/Ann', 'Form 2A/Cate', 'Grade 10A/Bob', 'Grade 12A/Zed',
    ]);
  });

  it('sorts learners the same way', () => {
    const l = sortLearnersByForm([
      { classLevel: 11, className: 'Grade 11A', fullName: 'B' },
      { classLevel: 3, className: 'Form 3A', fullName: 'A' },
    ]);
    expect(l[0].className).toBe('Form 3A');
  });

  it('names the level from the class name', () => {
    expect(levelHeading('Form 1A', 1)).toBe('Form 1');
    expect(levelHeading('grade 10 B', 10)).toBe('Grade 10');
    expect(levelHeading('', 4)).toBe('Level 4');
  });
});

describe('codes', () => {
  it('makes readable codes in the SP-XXXX-XXXX shape', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateCodeString();
      expect(c).toMatch(/^SP-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect([...c.slice(3).replace('-', '')].every(ch => CODE_ALPHABET.includes(ch))).toBe(true);
    }
  });

  it('reads what a sponsor types', () => {
    expect(normalizeCodeInput('sp-7kq3-m9xp')).toBe('SP-7KQ3-M9XP');
    expect(normalizeCodeInput(' SP 7KQ3 M9XP ')).toBe('SP-7KQ3-M9XP');
    expect(normalizeCodeInput('7KQ3M9XP')).toBe('SP-7KQ3-M9XP');
    expect(normalizeCodeInput('SP-7KQ3')).toBeNull();
    expect(normalizeCodeInput('SP-0000-1111')).toBeNull(); // 0 and 1 are never used
  });

  it('says why a code cannot be used', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const future = new Date('2026-11-01T00:00:00Z');
    const past = new Date('2026-10-01T00:00:00Z');
    expect(codeProblem(null, now)).toMatch(/not found/);
    expect(codeProblem({ status: 'active', expiresAt: future }, now)).toBeNull();
    expect(codeProblem({ status: 'used', expiresAt: future }, now)).toMatch(/already been used/);
    expect(codeProblem({ status: 'revoked', expiresAt: future }, now)).toMatch(/cancelled/);
    expect(codeProblem({ status: 'active', expiresAt: past }, now)).toMatch(/expired/);
    expect(displayStatus({ status: 'active', expiresAt: past }, now)).toBe('expired');
    expect(displayStatus({ status: 'used', expiresAt: past }, now)).toBe('used');
  });

  it('writes a message to send the sponsor', () => {
    const m = shareMessage(
      { code: 'SP-7KQ3-M9XP', sponsorName: 'CAMFED', term: 'Term 3', year: 2026, learnerCount: 12, expiresAt: new Date('2026-11-19T12:00:00Z') },
      'https://www.kalaboboarding.com/parent-portal?mode=sponsor'
    );
    expect(m).toContain('SP-7KQ3-M9XP');
    expect(m).toContain('12 learners');
    expect(m).toContain('once');
  });
});
