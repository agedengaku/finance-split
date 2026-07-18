CREATE TABLE IF NOT EXISTS owed_amounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id BIGINT UNSIGNED NOT NULL,
  from_user_id BIGINT UNSIGNED NOT NULL,
  to_user_id BIGINT UNSIGNED NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  description VARCHAR(160) NOT NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY owed_amounts_period_idx (period_id),
  CONSTRAINT owed_amounts_period_fk
    FOREIGN KEY (period_id) REFERENCES periods (id) ON DELETE CASCADE,
  CONSTRAINT owed_amounts_from_user_fk
    FOREIGN KEY (from_user_id) REFERENCES users (id),
  CONSTRAINT owed_amounts_to_user_fk
    FOREIGN KEY (to_user_id) REFERENCES users (id),
  CONSTRAINT owed_amounts_created_by_fk
    FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT owed_amounts_distinct_users_chk
    CHECK (from_user_id <> to_user_id)
);
