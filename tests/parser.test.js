/* Tests de l'analyse des phrases — lancer : node tests/parser.test.js
   Sans dépendance. La date du jour est figée (lundi 16 novembre 2026) pour des résultats stables.
   Ce dossier n'est pas mis en cache par sw.js (seuls les fichiers de CORE le sont). */
'use strict';
const RealDate = Date;
function freeze(isoDay) { // fige « maintenant » à 9h00 heure locale du jour donné
  const [y, m, d] = isoDay.split('-').map(Number);
  const fixed = new RealDate(y, m - 1, d, 9, 0, 0).getTime();
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(fixed); }
    static now() { return fixed; }
  }
  global.Date = FakeDate;
}
const P = require('../parser.js');

let ok = 0, ko = 0;
function check(phrase, expected, day = '2026-11-16') {
  freeze(day);
  const got = P.parseAll(phrase);
  global.Date = RealDate;
  const errs = [];
  if (got.length !== expected.length) errs.push(`${got.length} tâche(s) au lieu de ${expected.length}`);
  expected.forEach((e, i) => {
    const g = got[i] || {};
    for (const k of Object.keys(e)) if (g[k] !== e[k]) errs.push(`#${i + 1} ${k} : « ${g[k]} » au lieu de « ${e[k]} »`);
  });
  if (errs.length) { ko++; console.log('✗ ' + phrase + (day !== '2026-11-16' ? ` [jour ${day}]` : '') + '\n    ' + errs.join('\n    ') + '\n    obtenu : ' + JSON.stringify(got)); }
  else { ok++; console.log('✓ ' + phrase); }
}
const N = null;
const T = (title, date = N, time = N, prio = 'normale') => ({ title, date, time, prio });

// --- exemples du client et phrases d'atelier (aujourd'hui = lundi 16/11/2026)
check('Vérifier la pompe de la ligne 3 avant jeudi, urgent, et appeler le fournisseur demain à 10h',
  [T('Vérifier la pompe de la ligne 3', '2026-11-19', N, 'haute'), T('Appeler le fournisseur', '2026-11-17', '10:00')]);
check('commander des joints pour la presse 2', [T('Commander des joints pour la presse 2')]);
check('relancer Dupont lundi prochain', [T('Relancer Dupont', '2026-11-23')]);
check('rapport mensuel le 30', [T('Rapport mensuel', '2026-11-30')]);
check('réunion sécurité mercredi à 8h30', [T('Réunion sécurité', '2026-11-18', '08:30')]);
check('appeler Martin dans trois jours', [T('Appeler Martin', '2026-11-19')]);
check('envoyer le devis dans deux semaines', [T('Envoyer le devis', '2026-11-30')]);
check("préparer l'audit la semaine prochaine", [T("Préparer l'audit", '2026-11-23')]);
check('rappeler le client cet après-midi', [T('Rappeler le client', '2026-11-16')]);
check('vérifier le compresseur ce soir', [T('Vérifier le compresseur', '2026-11-16')]);
check('ce soir à 8h appeler le chef d\'équipe', [T("Appeler le chef d'équipe", '2026-11-16', '20:00')]);
check('réunion demain après-midi à 3h', [T('Réunion', '2026-11-17', '15:00')]);
check('commander 20 pièces pour le four 1 avant vendredi', [T('Commander 20 pièces pour le four 1', '2026-11-20')]);
check('graisser le convoyeur demain matin puis nettoyer la cuve 2', [T('Graisser le convoyeur', '2026-11-17'), T('Nettoyer la cuve 2')]);
check('appeler Dupont à 14h30, envoyer le rapport à Martin', [T('Appeler Dupont', N, '14:30'), T('Envoyer le rapport à Martin')]);
check('contrôler la presse 2 et la ligne 4 demain', [T('Contrôler la presse 2 et la ligne 4', '2026-11-17')]);
check("pas urgent, ranger l'atelier", [T("Ranger l'atelier", N, N, 'basse')]);
check("commander des roulements, c'est urgent", [T('Commander des roulements', N, N, 'haute')]);
check('Urgent : appeler le SAV', [T('Appeler le SAV', N, N, 'haute')]);
check('mettre à jour le plan de maintenance, ce n\'est pas pressé', [T('Mettre à jour le plan de maintenance', N, N, 'basse')]);
check('vérifier le stock de joints et commander des filtres', [T('Vérifier le stock de joints'), T('Commander des filtres')]);
check('il faut que je rappelle Dupont demain', [T('Rappeler Dupont', '2026-11-17')]);
check("rédiger le rapport d'incident pour le 2 décembre", [T("Rédiger le rapport d'incident", '2026-12-02')]);
check('changer le filtre de la ligne 3 le 15/12', [T('Changer le filtre de la ligne 3', '2026-12-15')]);
check('réunion de production à 7h demain', [T('Réunion de production', '2026-11-17', '07:00')]);
check("envoyer le planning d'ici vendredi et appeler la maintenance", [T('Envoyer le planning', '2026-11-20'), T('Appeler la maintenance')]);
check('lundi appeler Dupont et mardi relancer Martin', [T('Appeler Dupont', '2026-11-23'), T('Relancer Martin', '2026-11-17')]);
check('vérifier la pompe, demain appeler le fournisseur', [T('Vérifier la pompe'), T('Appeler le fournisseur', '2026-11-17')]);
check('appeler Dupont demain 9h', [T('Appeler Dupont', '2026-11-17', '09:00')]);
check('rendez-vous avec le bureau d\'études à 10:30 demain', [T("Rendez-vous avec le bureau d'études", '2026-11-17', '10:30')]);
check('réunion le 25/11 à 14h', [T('Réunion', '2026-11-25', '14:00')]);
check('inventaire fin novembre', [T('Inventaire', '2026-11-30')]);
check('fin du mois faire l\'inventaire du magasin', [T("Faire l'inventaire du magasin", '2026-11-30')]);
check('le 1er décembre audit sécurité', [T('Audit sécurité', '2026-12-01')]);
check('vérifier la pression à 6 bars sur la ligne 3', [T('Vérifier la pression à 6 bars sur la ligne 3')]);
check('commander 2 moteurs de 15 kW pour le 12', [T('Commander 2 moteurs de 15 kW', '2026-12-12')]);
check('Envoyer le rapport à M. Dupont. Appeler Mme Martin.', [T('Envoyer le rapport à M. Dupont'), T('Appeler Mme Martin')]);
check('je dois appeler Pierre et je dois voir Marc', [T('Appeler Pierre'), T('Voir Marc')]);
check("planifier l'arrêt technique dans un mois", [T("Planifier l'arrêt technique", '2026-12-16')]);
// --- nombres en lettres (belge et français)
check('appeler le fournisseur à dix heures demain', [T('Appeler le fournisseur', '2026-11-17', '10:00')]);
check('réunion à huit heures trente jeudi', [T('Réunion', '2026-11-19', '08:30')]);
check('réunion qualité à 10h et demie', [T('Réunion qualité', N, '10:30')]);
check('remplacer le moteur dans septante jours', [T('Remplacer le moteur', '2027-01-25')]);
check('remplacer le moteur dans soixante-dix jours', [T('Remplacer le moteur', '2027-01-25')]);
check('renouveler le contrat de maintenance dans nonante jours', [T('Renouveler le contrat de maintenance', '2027-02-14')]);
check('dans quinze jours calibrer les capteurs', [T('Calibrer les capteurs', '2026-12-01')]);
check('commander septante joints pour la ligne 2', [T('Commander septante joints pour la ligne 2')]);
// --- durées : ne pas les prendre pour une heure
check("former l'équipe pendant 3 heures jeudi", [T("Former l'équipe pendant 3h", '2026-11-19')]);
// --- autre jour de référence : samedi 21/11/2026
check('réunion sécurité mercredi à 8h30', [T('Réunion sécurité', '2026-11-25', '08:30')], '2026-11-21');
check('envoyer le rapport cette semaine', [T('Envoyer le rapport', '2026-11-27')], '2026-11-21');
check('rapport le 31', [T('Rapport', '2026-12-31')], '2026-11-21');
check('commander des gants le 3', [T('Commander des gants', '2026-12-03')], '2026-11-21');
check('vérifier les extincteurs demain', [T('Vérifier les extincteurs', '2027-01-01')], '2026-12-31');

// --- utilitaires de dates
freeze('2026-11-16');
const lab = [P.label('2026-11-15'), P.label('2026-11-16'), P.label('2026-11-17'), P.label('2026-11-10')];
global.Date = RealDate;
if (JSON.stringify(lab) === JSON.stringify(['Hier', "Aujourd'hui", 'Demain', 'En retard (6 j)'])) { ok++; console.log('✓ libellés de dates'); }
else { ko++; console.log('✗ libellés de dates : ' + JSON.stringify(lab)); }
// passage à l'heure d'hiver (25/10/2026) : pas de décalage d'un jour
freeze('2026-10-24');
const dst = P.parseAll('appeler Dupont dans 2 jours')[0].date;
global.Date = RealDate;
if (dst === '2026-10-26') { ok++; console.log('✓ changement d\'heure'); } else { ko++; console.log('✗ changement d\'heure : ' + dst); }

console.log(`\n${ok}/${ok + ko} tests réussis`);
process.exit(ko ? 1 : 0);
