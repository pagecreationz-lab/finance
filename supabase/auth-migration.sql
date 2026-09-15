begin;
alter table public.users add column if not exists username text;
alter table public.users add column if not exists password_hash text;
create unique index if not exists users_username_lower_unique on public.users (lower(username)) where username is not null;

update public.users set username='deepak',password_hash='scrypt$192c4da34ba6bff377e0787211fdb553$6f237eaf810fe835719eb335f5592047ff4224fb3ac2ab0e29149a5e2c74b1ed1022d569ed8c1d4c8734b2f1f5bd73af7dff0400d0244398b0b47bc8c4308d1d' where id='agent-deepak' and username is null;
update public.users set username='meera',password_hash='scrypt$192c4da34ba6bff377e0787211fdb553$6f237eaf810fe835719eb335f5592047ff4224fb3ac2ab0e29149a5e2c74b1ed1022d569ed8c1d4c8734b2f1f5bd73af7dff0400d0244398b0b47bc8c4308d1d' where id='agent-meera' and username is null;
update public.users set username='akash',password_hash='scrypt$192c4da34ba6bff377e0787211fdb553$6f237eaf810fe835719eb335f5592047ff4224fb3ac2ab0e29149a5e2c74b1ed1022d569ed8c1d4c8734b2f1f5bd73af7dff0400d0244398b0b47bc8c4308d1d' where id='agent-akash' and username is null;
update public.users set username='arjun',password_hash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0' where id='customer-arjun' and username is null;
update public.users set username='priya',password_hash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0' where id='customer-priya' and username is null;
update public.users set username='ravi',password_hash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0' where id='customer-ravi' and username is null;
update public.users set username='neha',password_hash='scrypt$e40f2868b93a71d6fc06971c765b9028$603c1bffe2cfc2f03f15f98f8010fb2de0c344089ccf04c9f1cdab36090e5d44c4e1b200d4ffadf161ef7e05de0370c2d4f83f843c4ffdf159dd2aa5534000f0' where id='customer-neha' and username is null;
commit;

