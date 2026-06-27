CREATE TABLE IF NOT EXISTS recurring_expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(160) NOT NULL,
  category VARCHAR(80) NULL,
  amount BIGINT UNSIGNED NOT NULL,
  paid_by BIGINT UNSIGNED NOT NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY recurring_expenses_household_idx (household_id),
  CONSTRAINT recurring_expenses_household_fk
    FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  CONSTRAINT recurring_expenses_paid_by_fk
    FOREIGN KEY (paid_by) REFERENCES users (id),
  CONSTRAINT recurring_expenses_created_by_fk
    FOREIGN KEY (created_by) REFERENCES users (id)
);
