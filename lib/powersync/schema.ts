import {
  Column,
  ColumnType,
  Schema,
  Table as PowerSyncTable
} from '@powersync/common';

type LegacyTableOptions = {
  name: string;
  columns: Column[];
  indexes?: Record<string, string[]>;
};

// Fonctions d'aide pour les colonnes
const column = {
  text: (name: string) => new Column({ name, type: ColumnType.TEXT }),
  integer: (name: string) => new Column({ name, type: ColumnType.INTEGER }),
  real: (name: string) => new Column({ name, type: ColumnType.REAL }),
};

// Constructeur compatible sans typage superflu
const Table: any = function createLegacyTable({ columns, indexes }: LegacyTableOptions) {
  const mappedColumns = Object.fromEntries(
    columns.map((currentColumn) => [currentColumn.name, { type: currentColumn.type }]),
  );

  return new PowerSyncTable(mappedColumns as any, { indexes } as any);
};

// 1. Agences (avec logo synchronisé)
export const agences = new Table({
  name: 'agences',
  columns: [
    column.text('nom_agence'),
    column.text('code_agence'),
    column.text('telephone_agence'),
    column.text('adresse_agence'),
    column.text('groupement'),
    column.text('logo_base64'),
    column.text('created_at')
  ]
});

// 2. Profils utilisateurs
export const profiles = new Table({
  name: 'profiles',
  columns: [
    column.text('agence_id'),
    column.text('full_name'),
    column.text('role'),
    column.text('created_at')
  ],
  indexes: {
    agence: ['agence_id']
  }
});

// 3. Profils de travail protégés par PIN
export const account_profiles = new Table({
  name: 'account_profiles',
  columns: [
    column.text('user_id'),
    column.text('name'),
    column.text('profile_type'),
    column.text('pin_hash'),
    column.text('created_at'),
    column.text('updated_at')
  ],
  indexes: { user: ['user_id'], type: ['profile_type'] }
});

// 4. Pèlerins (avec notes et photo d'identité optionnelle)
export const pelerins = new Table({
  name: 'pelerins',
  columns: [
    column.text('agence_id'),
    column.text('nom_complet'),
    column.text('prenom'),
    column.text('num_passeport'),
    column.text('date_naissance'),
    column.text('date_expiration'),
    column.text('sexe'),
    column.text('telephone_pelerin'),
    column.integer('sur_plateforme_gouv'),
    column.integer('sur_plateforme_nusuk'),
    column.text('document_url'),
    column.text('photo_url'),
    column.text('notes'),
    column.text('nom_package'),
    column.real('prix_package'),
    column.real('total_paye'),
    column.integer('vacciné'),
    column.integer('visite_medicale'),
    column.integer('formation_suivie'),
    column.text('date_formation'),
    column.text('groupe_formation'),
    column.text('hotel_mecque'),
    column.text('hotel_medine'),
    column.integer('hotel_statut'),
    column.text('chambre_mecque_id'),
    column.text('chambre_medine_id'),
    column.text('groupe_encadrement'),
    column.text('date_depart'),
    column.text('date_retour'),
    column.integer('visa_obtenu'),
    column.text('reference'),
    column.text('agence_ou_personne_associee'),
    column.text('date_inscription'),
    column.integer('campagne'),
    column.integer('statut_gouv'),
    column.text('gouv_postule_at'),
    column.text('hajj_session_id'),
    column.text('created_at')
  ],
  indexes: {
    agence: ['agence_id'],
    session: ['hajj_session_id'],
    passeport: ['num_passeport'],
    chambre_mecque: ['chambre_mecque_id'],
    chambre_medine: ['chambre_medine_id']
  }
});

// 5. Paiements Pèlerins
export const pelerin_payments = new Table({
  name: 'pelerin_payments',
  columns: [
    column.text('pelerin_id'),
    column.real('amount'),
    column.text('payment_date'),
    column.text('payment_mode'),
    column.text('notes'),
    column.text('created_at')
  ],
  indexes: {
    pelerin: ['pelerin_id']
  }
});

// 6. Opérations Agence (Ventes, Billetterie, Visas, etc.)
export const operations_agence = new Table({
  name: 'operations_agence',
  columns: [
    column.text('agence_id'),
    column.text('user_id'),
    column.text('type_activite'),
    column.text('client_nom'),
    column.text('client_telephone'),
    column.text('client_email'),
    column.text('description'),
    column.real('prix_achat'),
    column.real('prix_vente'),
    column.real('frais_annexes'),
    column.real('montant_verse'),
    column.real('benefice'),
    column.text('mode_paiement'),
    column.text('statut_paiement'),
    column.text('compagnie_fournisseur'),
    column.text('reference_document'),
    column.text('notes_internes'),
    column.text('vol_depart'),
    column.text('vol_destination'),
    column.text('date_depart'),
    column.text('date_retour'),
    column.text('classe_voyage'),
    column.text('numero_vol'),
    column.text('bagages_kg'),
    column.text('type_visa'),
    column.text('pays_destination_visa'),
    column.text('date_depot_visa'),
    column.text('duree_sejour'),
    column.text('numero_passeport'),
    column.text('devise_source'),
    column.text('devise_cible'),
    column.real('montant_transfert'),
    column.real('taux_change'),
    column.text('beneficiaire_nom'),
    column.text('beneficiaire_contact'),
    column.text('type_assurance'),
    column.text('duree_couverture'),
    column.text('numero_police'),
    column.text('hotel_nom'),
    column.text('hotel_ville'),
    column.text('date_checkin'),
    column.text('date_checkout'),
    column.integer('nombre_nuits'),
    column.text('type_chambre'),
    column.text('type_transport'),
    column.text('depart_transport'),
    column.text('arrivee_transport'),
    column.text('date_voyage'),
    column.integer('nombre_places'),
    column.text('updated_at'),
    column.text('created_at')
  ],
  indexes: {
    agence: ['agence_id'],
    type: ['type_activite'],
    date_op: ['created_at']
  }
});

// 7. Dépenses d'agence
export const depenses = new Table({
  name: 'depenses',
  columns: [
    column.text('agence_id'),
    column.text('libelle'),
    column.text('categorie'),
    column.integer('montant'),
    column.text('mode_paiement'),
    column.text('date_depense'),
    column.text('notes'),
    column.text('created_at')
  ],
  indexes: {
    agence: ['agence_id'],
    date: ['date_depense']
  }
});

// 8. Dépenses Hajj
export const depenses_hajj = new Table({
  name: 'depenses_hajj',
  columns: [
    column.text('user_id'),
    column.text('type_cible'),
    column.text('cible_valeur'),
    column.text('libelle'),
    column.real('montant'),
    column.text('created_at')
  ]
});

// 9. Dépenses supprimées (Audit)
export const depenses_supprimees = new Table({
  name: 'depenses_supprimees',
  columns: [
    column.text('agence_id'),
    column.text('depense_id'),
    column.text('libelle'),
    column.text('categorie'),
    column.integer('montant'),
    column.text('mode_paiement'),
    column.text('date_depense'),
    column.text('notes'),
    column.text('created_at'),
    column.text('supprime_le'),
    column.text('supprime_par')
  ]
});

// 10. Budgets mensuels
export const budgets_mensuels = new Table({
  name: 'budgets_mensuels',
  columns: [
    column.text('agence_id'),
    column.integer('annee'),
    column.integer('mois'),
    column.text('categorie'),
    column.integer('budget_prevu'),
    column.text('created_at')
  ]
});

// 11. Budgets modulables de l'agence
export const budgets_agence = new Table({
  name: 'budgets_agence',
  columns: [
    column.text('agence_id'),
    column.text('categorie_id'),
    column.text('label'),
    column.text('couleur'),
    column.real('montant_plafond'),
    column.text('periode_type'),
    column.text('created_at'),
    column.text('updated_at')
  ],
  indexes: {
    agence: ['agence_id'],
    categorie: ['categorie_id']
  }
});

// 12. Sessions Hajj
export const hajj_sessions = new Table({
  name: 'hajj_sessions',
  columns: [
    column.text('nom_session'),
    column.integer('quota_alloue'),
    column.integer('quota_utilise'),
    column.real('duree_heures'),
    column.text('date_ouverture'),
    column.text('date_expiration'),
    column.text('date_fermeture'),
    column.integer('est_active'),
    column.text('statut_fermeture')
  ]
});

// 13. Configuration Campagne Hajj
export const hajj_campaign_config = new Table({
  name: 'hajj_campaign_config',
  columns: [
    column.integer('session_ouverte'),
    column.integer('quota_total_global'),
    column.integer('quota_restant_global'),
    column.integer('quota_max_par_agence'),
    column.integer('max_postulations_par_minute'),
    column.integer('quota_session_total'),
    column.integer('quota_session_restant'),
    column.text('updated_at')
  ]
});

// 14. Vols
export const vols = new Table({
  name: 'vols',
  columns: [
    column.text('numero_vol'),
    column.text('compagnie'),
    column.text('aeroport_depart'),
    column.text('aeroport_arrivee'),
    column.text('date_depart'),
    column.text('date_retour'),
    column.integer('places_totales'),
    column.text('created_at')
  ]
});

// 15. Hôtels (Mecque & Médine)
export const hotels = new Table({
  name: 'hotels',
  columns: [
    column.text('agence_id'),
    column.text('nom'),
    column.text('ville'),
    column.text('adresse'),
    column.integer('campagne'),
    column.text('created_at')
  ],
  indexes: {
    agence: ['agence_id'],
    ville: ['ville'],
    campagne: ['campagne']
  }
});

// 16. Chambres d'hôtel
export const chambres = new Table({
  name: 'chambres',
  columns: [
    column.text('hotel_id'),
    column.text('agence_id'),
    column.text('numero_chambre'),
    column.text('etage'),
    column.integer('capacite'),
    column.text('genre_chambre'),
    column.text('created_at')
  ],
  indexes: {
    hotel: ['hotel_id'],
    agence: ['agence_id']
  }
});

// 17. Types de documents
export const types_documents = new Table({
  name: 'types_documents',
  columns: [
    column.text('nom_section'),
    column.text('description'),
    column.text('created_at')
  ]
});

// 18. Fichiers documents agence
export const documents_agence_files = new Table({
  name: 'documents_agence_files',
  columns: [
    column.text('agence_id'),
    column.text('type_doc_id'),
    column.text('file_url'),
    column.text('file_name'),
    column.text('created_at')
  ]
});

// 19. Documents internes agence
export const documents_internes_agence = new Table({
  name: 'documents_internes_agence',
  columns: [
    column.text('agence_id'),
    column.text('nom_fichier'),
    column.text('url_stockage'),
    column.text('categorie'),
    column.text('created_at')
  ]
});

// 20. Log postulations gouvernementales
export const gouv_postulations_log = new Table({
  name: 'gouv_postulations_log',
  columns: [
    column.text('agence_id'),
    column.text('created_at')
  ]
});

// Assemblage complet du schéma
export const AppSchema = new Schema({
  agences,
  profiles,
  account_profiles,
  pelerins,
  pelerin_payments,
  operations_agence,
  depenses,
  depenses_hajj,
  depenses_supprimees,
  budgets_mensuels,
  budgets_agence,
  hajj_sessions,
  hajj_campaign_config,
  vols,
  hotels,
  chambres,
  types_documents,
  documents_agence_files,
  documents_internes_agence,
  gouv_postulations_log
});

export type Database = (typeof AppSchema)['types'];