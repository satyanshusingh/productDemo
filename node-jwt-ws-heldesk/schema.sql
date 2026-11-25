CREATE TABLE customers (
customer_id int unsigned auto_increment primary key,
full_name varchar(120) not null,
email varchar(190) not null unique,
phone varchar(20),
last_seen_at datetime null,
created_at timestamp default current_timestamp
) engine=InnoDB;

create table departments (
department_id int unsigned auto_increment primary key,
department_name varchar(80) not null unique
) engine=InnoDB;

show tables;

create table agents (
agent_id int unsigned auto_increment primary key,
department_id int unsigned not null,
full_name varchar(120) not null,
email varchar(190) not null unique,
role enum('Agent','Manager') not null default 'Agent',
is_active boolean not null default true,
constraint fk_agent_departmenstockt foreign key (department_id) references departments(department_id)
on delete restrict
) engine=InnoDB;

create table tickets (
ticket_id bigint unsigned auto_increment primary key,
customer_id int unsigned not null,
assigned_agent_id int unsigned null,
title varchar(200) not null,
description text not null,
priority enum('Low','Medium','High','Critical') not null default 'Medium',
status enum('Open','In Progress','On Hold','Completed','Resolved','Reopened') not null default 'Open',
created_at timestamp default current_timestamp,
updated_at timestamp default current_timestamp on update current_timestamp,
resolved_at datetime null,
constraint fk_ticket_customer foreign key (customer_id) references customers(customer_id),
constraint fk_ticket_agent foreign key (assigned_agent_id) references agents(agent_id) on delete set null,
index idx_tickets_status_created (status,created_at)
) engine=InnoDB;


insert into customers (full_name,email,phone)
values ('satya', 'satya@gmail.com', '467654567');


insert into departments (department_name)
values ('Technical Support'),('Customer Success');

update customers set phone = '996557687' where customer_id=1;

CREATE TABLE IF NOT EXISTS app_users (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    username VARCHAR(32) NOT NULL UNIQUE,
    role ENUM('agent', 'manager', 'customer') NOT NULL,
    customer_id INT UNSIGNED NULL,
    agent_id INT UNSIGNED NULL,
    password_salt CHAR(32) NOT NULL,
    password_hash CHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_messages (
    message_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    sender_name VARCHAR(120) NOT NULL,
    sender_role ENUM('customer', 'agent', 'manager') NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_message_ticket FOREIGN KEY (ticket_id)
        REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    INDEX idx_messages_ticket_created (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
    notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipient_role ENUM('manager', 'customer') NOT NULL,
    recipient_id VARCHAR(64) NULL,
    ticket_id BIGINT UNSIGNED NULL,
    message VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,
    INDEX idx_notifications_recipient (recipient_role, recipient_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

