create table
    if not exists products (
        id int unsigned auto_increment primary key,
        sku varchar(32) not null unique,
        name varchar(100) not null,
        price decimal(10, 2) not null,
        stock int unsigned not null default 0,
        created_at timestamp default current_timestamp,
        updated_at timestamp default current_timestamp on update current_timestamp,
        constraint chk_products_price check (price >= 0)
    ) engine = InnoDB;

insert into
    products (sku, name, price, stock)
values
    ('LAP-001', 'Laptop', 55000.00, 10),
    ('MOU-001', 'Wireless Mouse', 799.00, 40),
    ('KEY-001', 'Keyboard', 1599.00, 15),
    ('DES-001', 'Desktop', 25000.00, 20)